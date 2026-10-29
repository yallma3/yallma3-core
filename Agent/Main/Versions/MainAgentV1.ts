import type { MainAgent } from "../MainAgent";
import { getTaskExecutionOrderWithContext } from "../../../Task/TaskGraph";
import type {
  AgentStep,
  CoreTaskAnalysis,
  Task,
  TaskGraph,
} from "../../../Models/Task";
import {
  analyzeTaskCore,
  planAgenticTask,
} from "../../../Task/TaskIntrepreter";
import { assignBestFit } from "../../Utls/MainAgentHelper";
import type { BestFitAssignment } from "../../Utls/MainAgentHelper";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { workflowExecutor } from "../../Utls/ToolCallingHelper";
import { requestStop } from "../../../Workflow/runtime";
import type { WorkspaceData } from "../../../Models/Workspace";
import { WorkspaceRepository } from "../../../Execution/WorkspaceRepository";
import { Yallma3GenOneAgentRuntime } from "../../Agent";
import { FatalMainLLMError, getLLMProvider, testLLMHealth } from "../../../LLM/LLMRunner";
import type { LLMProvider } from "../../../Models/LLM";
import type { ExecutionContext } from "../../../Execution/ExecutionContext";
import { validateWorkspace } from "../../Validation/WorkspaceValidator";
import { ExecutionTracer, logVerboseWorkspaceGraph } from "../../../Execution/ExecutionTracer";
import { OutputTokenManager } from "../../../Execution/OutputTokenManager";

export class MainAgentV1 implements MainAgent {
  version = "1.0.0";
  private aborted = false;
  private currentWorkflowId: string | null = null;
  private workspaceId: string;
  private tracer = new ExecutionTracer();

  constructor(
    workspaceData: WorkspaceData,
    private ctx: ExecutionContext,
    private triggerData?: unknown
  ) {
    const repo = WorkspaceRepository.getInstance();
    repo.set(workspaceData.id, workspaceData);
    repo.setCurrent(workspaceData.id);
    this.workspaceId = workspaceData.id;

    for (const wf of workspaceData.workflows ?? []) {
      this.tracer.recordWorkflow(wf);
    }
  }

  private get workspaceData(): WorkspaceData {
    return WorkspaceRepository.getInstance().get(this.workspaceId)!;
  }

  async run(): Promise<Record<string, string>> {
    if (!this.workspaceData) {
      console.warn("[MainAgentV1] No workspace data available for execution.");
      return {};
    }

    // Verbose stdio printing immediately once received for execution
    logVerboseWorkspaceGraph(this.workspaceData, this.tracer.getWorkflows());

    const validation = validateWorkspace(this.workspaceData);
    if (!validation.valid) {
      console.error(`[Workspace Validation Failed] ${validation.error.message}`);
      this.emitErrorRaw(validation.error.message, null, false);
      if (process.env.YALLMA3_OUTPUT_JSON === "1" || process.env.YALLMA3_OUTPUT_JSON === "true") {
        await this.saveResults(
          [],
          {},
          {},
          "failed",
          `Workspace Validation Failed: ${validation.error.message}`,
          { totalTasks: 0, succeededTasks: 0, failedTasks: 0, blockedTasks: 0 },
          "validation_error",
          validation.error.message
        );
      }
      return {};
    }

    await this.initialize();
    if (this.aborted) {
      console.warn(`[Workspace Aborted] Initialization failed or LLM unreachable.`);
      if (process.env.YALLMA3_OUTPUT_JSON === "1" || process.env.YALLMA3_OUTPUT_JSON === "true") {
        await this.saveResults(
          [],
          {},
          {},
          "aborted",
          "Workspace initialization failed or LLM unreachable.",
          { totalTasks: 0, succeededTasks: 0, failedTasks: 0, blockedTasks: 0 },
          "aborted"
        );
      }
      return {};
    }

    const results: Record<string, string> = {};
    const taskStatuses: Record<string, { status: string; reason?: string }> = {};
    const layers = this.createTaskLayers();
    const MainLLM = this.createLLM();

    let step = 1;

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx];
      if (this.aborted) break;

      const task = this.getTask(layer.taskId);
      if (!task) continue;

      const taskStart = Date.now();
      this.tracer.recordStep({
        type: "task",
        name: task.title,
        status: "started",
        taskId: task.id,
      });

      const taskContext = this.buildTaskContext(layer, results, taskStatuses);

      if (taskStatuses[task.id]?.status === "blocked") {
        this.tracer.recordStep({
          type: "task",
          name: task.title,
          status: "blocked",
          taskId: task.id,
          durationMs: Date.now() - taskStart,
          details: taskStatuses[task.id]?.reason ?? "Blocked by upstream dependency",
        });
        this.emitInfo(
          `Task '${task.title}' skipped: ${taskStatuses[task.id]?.reason ?? "Blocked by upstream dependency"}`
        );
        step++;
        continue;
      }

      const bestFit = await this.assignIfNeeded(task, MainLLM);

      if (!bestFit) {
        this.emitErrorRaw(
          `Task '${task.title}' could not be assigned to any executor. Aborting.`,
          null,
          false
        );
        this.tracer.recordStep({
          type: "task",
          name: task.title,
          status: "failed",
          taskId: task.id,
          durationMs: Date.now() - taskStart,
          details: "Could not be assigned to any executor",
        });
        taskStatuses[task.id] = {
          status: "failed",
          reason: "Could not be assigned to any executor",
        };
        for (let i = layerIdx + 1; i < layers.length; i++) {
          const remId = layers[i].taskId;
          if (!taskStatuses[remId]) {
            taskStatuses[remId] = {
              status: "blocked",
              reason: `Blocked because task '${task.title}' failed assignment`,
            };
          }
        }
        break;
      }

      if (this.isWorkflow(task, bestFit)) {
        await this.executeWorkflowTask({
          task,
          layerIndex: step,
          totalLayers: layers.length,
          bestFit,
          taskContext,
          results,
          taskStatuses,
          taskStart,
        });
        step++;
        continue;
      }

      if (this.aborted) break;

      const coreAnalysis = await this.analyzeTaskCore(
        MainLLM,
        task,
        taskContext
      );

      if (this.aborted) break;

      const agentPlan = await this.createAgentPlan(
        MainLLM,
        task,
        coreAnalysis,
        taskContext
      );

      if (this.aborted) break;

      const agentResult = await this.runAgent(
        task,
        agentPlan,
        taskContext,
        bestFit
      );

      if (agentResult) {
        taskStatuses[task.id] = { status: 'success' };
        results[task.id] = agentResult;
        this.tracer.recordStep({
          type: "task",
          name: task.title,
          status: "success",
          taskId: task.id,
          durationMs: Date.now() - taskStart,
          output: agentResult,
        });
        this.emitSuccess(step, layers.length, task.title, {
          result: agentResult,
        });
      } else {
        taskStatuses[task.id] = { status: 'failed', reason: 'Agent execution failed' };
        this.tracer.recordStep({
          type: "task",
          name: task.title,
          status: "failed",
          taskId: task.id,
          durationMs: Date.now() - taskStart,
          details: "Agent execution failed",
        });
        this.emitError(step, layers.length, task.title);
      }

      step++;
    }

    await this.finalize(layers, results, taskStatuses);
    return results;
  }

  async abort(): Promise<void> {
    this.aborted = true;
    if (this.currentWorkflowId) {
      requestStop(this.currentWorkflowId);
    }
    this.emitErrorRaw("Execution aborted by user", "", false);
  }

  // STAGE 1: INITIALIZATION

  private async initialize() {
    this.emitSystem("Main agent initializing...");

    const health = await testLLMHealth(
      this.workspaceData.mainLLM,
      this.workspaceData.apiKey
    );
    if (!health.ok) {
      this.emitErrorRaw("Main LLM unreachable at startup", health.error, true);
      this.aborted = true;
    }
  }

  // STAGE 2: PREP

  private createTaskLayers() {
    const taskGraph: TaskGraph = {
      tasks: this.workspaceData.tasks,
      connections: this.workspaceData.connections,
    };
    return getTaskExecutionOrderWithContext(taskGraph);
  }

  private createLLM() {
    return getLLMProvider(
      this.workspaceData.mainLLM,
      this.workspaceData.apiKey
    );
  }

  private getTask(id: string) {
    return this.workspaceData.tasks.find((t) => t.id === id);
  }

  /**
   * Builds execution context for a task layer from upstream task results,
   * marking the task as blocked if any upstream dependency did not complete successfully.
   */
  private buildTaskContext(
    layer: { taskId: string; context: string[] },
    results: Record<string, string>,
    statuses: Record<string, { status: string; reason?: string }>
  ) {
    // If a dependency failed or was blocked, mark this task blocked
    for (const dep of layer.context) {
      const st = statuses[dep];
      if (st?.status !== 'success') {
        statuses[layer.taskId] = {
          status: 'blocked',
          reason: `Upstream task dependency '${dep}' not completed successfully`,
        };
        return "";
      }
    }
    return layer.context.map((c) => results[c]).join(" , ");
  }

  // STAGE 3: TASK ASSIGNMENT

  /**
   * Resolves the best executor for a task.
   *
   * Priority order:
   *  1. If task.executorId is set → resolve it directly to a Workflow
   *     (when task.type === "workflow") or Agent (when task.type ===
   *     "specific-agent"). Fails if the ID is not found.
   *  2. If task.type is "agentic" → use LLM-based assignBestFit.
   *  3. Otherwise → no assignment needed (null).
   */
  private async assignIfNeeded(
    task: Task,
    llm: LLMProvider
  ): Promise<BestFitAssignment | null> {
    let bestFit: BestFitAssignment | null = null;

    // ── Priority 1: Explicit executorId ──────────────────────────────
    if (task.executorId) {
      const eid = task.executorId;

      if (task.type === "workflow") {
        const workflow = this.workspaceData.workflows.find((w) => w.id === eid);
        if (workflow) {
          bestFit = {
            type: "workflow",
            id: workflow.id,
            name: workflow.name,
            confidence: 1,
            reasoning: "Explicit executorId matched a workflow.",
          };
          this.emitSystem(
            `Assigned task '${task.title}' to workflow '${workflow.name}' (explicit executorId).`
          );
        } else {
          this.emitErrorRaw(
            `executorId '${eid}' for workflow task '${task.title}' not found.`,
            null,
            false
          );
        }
      } else if (task.type === "specific-agent") {
        const agent = this.workspaceData.agents.find((a) => a.id === eid);
        if (agent) {
          bestFit = {
            type: "agent",
            id: agent.id,
            name: agent.name,
            confidence: 1,
            reasoning: "Explicit executorId matched an agent.",
          };
          this.emitSystem(
            `Assigned task '${task.title}' to agent '${agent.name}' (explicit executorId).`
          );
        } else {
          this.emitErrorRaw(
            `executorId '${eid}' for agent task '${task.title}' not found.`,
            null,
            false
          );
        }
      }

      // ── Priority 2: LLM-based assignment for agentic tasks ──────────
    } else if (task.type === "agentic") {
      this.emitSystem(`Assigning task '${task.title}' via LLM...`);

      const wrappedLLM = this.tracer.wrapLLM(
        llm,
        {
          source: "main_agent",
          action: "assign_best_fit",
          taskId: task.id,
        },
        {
          providerName: this.workspaceData.mainLLM.provider,
          modelName: this.workspaceData.mainLLM.model.name,
        }
      );

      bestFit = await assignBestFit(
        wrappedLLM,
        task,
        this.workspaceData.workflows,
        this.workspaceData.agents
      );

      if (bestFit) {
        this.emitSystem(
          `Assigned task '${task.title}' to ${bestFit.type} '${
            bestFit.name
          }' (confidence ${bestFit.confidence.toFixed(2)}).`
        );
      }
    }

    return bestFit;
  }

  private isWorkflow(task: Task, bestFit: BestFitAssignment | null) {
    return task.type === "workflow" || bestFit?.type === "workflow";
  }

  // STAGE 4: WORKFLOW EXECUTION

  /**
   * Executes a workflow task by delegating to workflowExecutor and recording results/steps.
   */
  private async executeWorkflowTask({
    task,
    layerIndex,
    totalLayers,
    bestFit,
    taskContext,
    results,
    taskStatuses,
    taskStart,
  }: {
    task: Task;
    layerIndex: number;
    totalLayers: number;
    bestFit: BestFitAssignment | null;
    taskContext: string;
    results: Record<string, string>;
    taskStatuses: Record<string, { status: string; reason?: string }>;
    taskStart?: number;
  }) {
    if (this.aborted) return;

    const start = taskStart ?? Date.now();
    // if bestFit is not null then we have decided already, bestFit could be the same task.executorId
    const workflowId = bestFit ? bestFit.id : task.executorId;
    if (!workflowId) {
      this.tracer.recordStep({
        type: "task",
        name: task.title,
        status: "failed",
        taskId: task.id,
        durationMs: Date.now() - start,
        details: "No workflowId found",
      });
      this.emitError(layerIndex, totalLayers, task.title);
      return;
    }

    this.emitInfo(
      `[${layerIndex}/${totalLayers}] Running task '${task.title}' (workflow: ${
        bestFit ? bestFit.name : workflowId
      })`
    );
    if (taskStatuses[task.id]?.status === "blocked") {
      // Upstream dependency already recorded as blocked by buildTaskContext
      this.tracer.recordStep({
        type: "task",
        name: task.title,
        status: "blocked",
        taskId: task.id,
        durationMs: Date.now() - start,
        details: taskStatuses[task.id]?.reason ?? "Blocked by upstream dependency",
      });
      return;
    }

    this.currentWorkflowId = workflowId;
    try {
      const execution = await workflowExecutor(
        this.ctx,
        workflowId,
        taskContext,
        this.triggerData,
        undefined,
        this.tracer,
        task.id
      );
      this.currentWorkflowId = null;

      if (this.aborted) return;
      if (execution.status === "completed" && execution.result) {
        taskStatuses[task.id] = { status: 'success' };
        const value = execution.result;
        results[task.id] =
          typeof value === "string" ? value : JSON.stringify(value);

        this.tracer.recordStep({
          type: "task",
          name: task.title,
          status: "success",
          taskId: task.id,
          workflowId,
          durationMs: Date.now() - start,
          output: results[task.id],
        });

        this.emitSuccess(layerIndex, totalLayers, task.title, {
          task: JSON.stringify(value, null, 2),
        });
      } else {
        taskStatuses[task.id] = {
          status: 'failed',
          reason: execution.reason ?? 'No result returned',
        };
        this.tracer.recordStep({
          type: "task",
          name: task.title,
          status: "failed",
          taskId: task.id,
          workflowId,
          durationMs: Date.now() - start,
          details: execution.reason ?? 'No result returned',
        });
        this.emitError(layerIndex, totalLayers, task.title, execution.reason);
      }
    } catch (err) {
      if (err instanceof FatalMainLLMError) {
        this.emitErrorRaw(
          "Main LLM fatal failure during execution",
          err.message,
          true
        );
        this.aborted = true;
        return;
      }
      taskStatuses[task.id] = { status: 'failed', reason: (err as Error).message };
      this.tracer.recordStep({
        type: "task",
        name: task.title,
        status: "failed",
        taskId: task.id,
        workflowId,
        durationMs: Date.now() - start,
        details: (err as Error).message,
      });
      throw err;
    }
  }

  // STAGE 5: AGENT EXECUTION

  private async analyzeTaskCore(llm: LLMProvider, task: Task, context: string) {
    this.emitSystem(`Analysing task '${task.title}'...`);
    const wrappedLLM = this.tracer.wrapLLM(
      llm,
      {
        source: "main_agent",
        action: "analyze_task_core",
        taskId: task.id,
      },
      {
        providerName: this.workspaceData.mainLLM.provider,
        modelName: this.workspaceData.mainLLM.model.name,
      }
    );
    return analyzeTaskCore(wrappedLLM, task, context);
  }

  private async createAgentPlan(
    llm: LLMProvider,
    task: Task,
    coreAnalysis: CoreTaskAnalysis,
    context: string
  ) {
    this.emitInfo(`Creating agent plan...`);
    const wrappedLLM = this.tracer.wrapLLM(
      llm,
      {
        source: "main_agent",
        action: "create_agent_plan",
        taskId: task.id,
      },
      {
        providerName: this.workspaceData.mainLLM.provider,
        modelName: this.workspaceData.mainLLM.model.name,
      }
    );

    try {
      const plan = await planAgenticTask(wrappedLLM, coreAnalysis, task, context);

      this.emitSuccessRaw(
        "Agent plan created successfully",
        JSON.stringify(plan, null, 2)
      );
      return plan;
    } catch (err) {
      this.emitErrorRaw("Agent plan creation failed", err);
      throw err;
    }
  }

  private async runAgent(
    task: Task,
    plan: AgentStep[],
    context: string,
    bestFit: { type: string; id: string } | null
  ) {
    let result;
    const agentId =
      task.type === "specific-agent"
        ? task.executorId
        : bestFit?.type === "agent"
        ? bestFit.id
        : null;

    const agent = this.workspaceData.agents.find((a) => a.id === agentId);
    if (!agent) {
      this.emitError(0, 0, task.title);
      return null;
    }

    this.emitInfo(`Running agent '${agent.name}' for '${task.title}'`);

    const runtime = new Yallma3GenOneAgentRuntime(
      agent,
      task,
      context,
      plan,
      this.ctx,
      this.workspaceData.apiKey,
      this.workspaceData.mainLLM,
      "",
      this.tracer
    );
    runtime.setAbortChecker(() => this.aborted);
    try {
      result = await runtime.run();
    } catch (e) {
      console.error("Agent execution error:", e);
      this.emitErrorRaw("Agent execution failed", e);
      return null;
    }
    return result;
  }

  // STAGE 6: FINALIZE

  private async finalize(
    layers: { taskId: string }[],
    results: Record<string, string>,
    taskStatuses: Record<string, { status: string; reason?: string }> = {}
  ) {
    const total = layers.length;
    const succeeded = layers.filter((l) => taskStatuses[l.taskId]?.status === "success").length;
    const blocked = layers.filter((l) => taskStatuses[l.taskId]?.status === "blocked").length;
    const failed = layers.filter(
      (l) => taskStatuses[l.taskId]?.status === "failed" || !taskStatuses[l.taskId]
    ).length;

    let workspaceStatus: "completed" | "failed" | "partial_success" | "aborted" = "completed";
    let statusReason = "Workspace completed successfully.";

    if (this.aborted) {
      workspaceStatus = "aborted";
      statusReason = "Workspace execution was aborted.";
    } else if (succeeded === 0 && (failed > 0 || blocked > 0)) {
      workspaceStatus = "failed";
      statusReason = `Workspace execution failed: ${failed} task${failed === 1 ? "" : "s"} failed, ${blocked} blocked.`;
    } else if (failed > 0 || blocked > 0) {
      workspaceStatus = "partial_success";
      statusReason = `Workspace execution finished with partial failures: ${succeeded} succeeded, ${failed} failed, ${blocked} blocked.`;
    }

    const finalTaskId = layers[layers.length - 1]?.taskId ?? "";
    const finalTaskSucceeded = taskStatuses[finalTaskId]?.status === "success";
    const finalResult =
      workspaceStatus === "completed"
        ? (finalTaskId && results[finalTaskId]) || JSON.stringify(results, null, 2)
        : finalTaskSucceeded && results[finalTaskId]
        ? results[finalTaskId]
        : null;

    results["__meta__"] = JSON.stringify({
      version: this.version,
      timestamp: Date.now(),
    });
    if (finalResult !== null) {
      results["__final__"] = finalResult;
    } else {
      delete results["__final__"];
    }

    if (workspaceStatus === "failed") {
      console.error(`❌ Workspace '${this.workspaceData.name}' execution failed: ${statusReason}`);
      this.emit("error", statusReason);
      this.ctx.send({
        type: "error",
        requestId: this.ctx.requestId,
        commandType: "run_workspace" as const,
        code: "WORKSPACE_FAILED" as const,
        message: statusReason,
        timestamp: new Date().toISOString(),
      });
    } else if (workspaceStatus === "partial_success") {
      console.warn(`⚠️ Workspace '${this.workspaceData.name}' completed with partial failures: ${statusReason}`);
      this.emit("warn", statusReason, undefined, "WORKSPACE_PARTIAL_SUCCESS");
    } else {
      console.log(`✅ Workspace '${this.workspaceData.name}' completed successfully.`);
      this.emitSuccessRaw("Workspace completed successfully.", finalResult ?? undefined);
    }

    let exitStatus: "success" | "aborted" | "blocked" | "validation_error" = "success";
    if (this.aborted) {
      exitStatus = "aborted";
    } else if (failed > 0 || blocked > 0) {
      exitStatus = "blocked";
    } else {
      exitStatus = "success";
    }

    this.emitWorkspaceStopped();
    await this.saveResults(
      layers,
      results,
      taskStatuses,
      workspaceStatus,
      statusReason,
      {
        totalTasks: total,
        succeededTasks: succeeded,
        failedTasks: failed,
        blockedTasks: blocked,
      },
      exitStatus
    );
  }

  /**
   * Builds first-class problem diagnostics attributing failures to root causes and listing impacted tasks.
   */
  private buildDiagnostics(
    taskStatuses: Record<string, { status: string; reason?: string }> = {},
    validationError?: string
  ) {
    if (validationError) {
      return {
        hasFailures: true,
        rootCauses: [
          {
            source: "task" as const,
            errorCategory: "CONFIGURATION_ERROR" as const,
            message: validationError,
            suggestedRemediation: "Inspect workspace tasks, sockets, agents, and configuration parameters.",
          },
        ],
        impactedTasks: [],
      };
    }
    const steps = this.tracer.getSteps();
    const hasFailures = Object.values(taskStatuses).some(
      (s) => s.status === "failed" || s.status === "blocked"
    );

    const rootCauses: Array<{
      source: "workflow_node" | "task";
      taskId?: string;
      workflowId?: string;
      nodeId?: number;
      nodeTitle?: string;
      errorCategory: "TRANSPORT_ERROR" | "CONFIGURATION_ERROR" | "AUTH_ERROR" | "LLM_ERROR" | "TIMEOUT_ERROR" | "RUNTIME_ERROR";
      message: string;
      failedInput?: unknown;
      suggestedRemediation: string;
    }> = [];

    const failedNodeSteps = steps.filter((s) => s.type === "workflow_node" && s.status === "failed");
    for (const ns of failedNodeSteps) {
      const msg = ns.details ?? "Workflow node failed";
      let errorCategory: "TRANSPORT_ERROR" | "CONFIGURATION_ERROR" | "AUTH_ERROR" | "LLM_ERROR" | "TIMEOUT_ERROR" | "RUNTIME_ERROR" = "RUNTIME_ERROR";
      let suggestedRemediation = "Inspect node inputs and configuration parameters in the workflow.";

      const lowerMsg = msg.toLowerCase();
      if (lowerMsg.includes("sse") || lowerMsg.includes("connect") || lowerMsg.includes("econnrefused") || lowerMsg.includes("network")) {
        errorCategory = "TRANSPORT_ERROR";
        suggestedRemediation = "Verify that the external server endpoint is running and reachable from the host network.";
      } else if (lowerMsg.includes("timeout") || lowerMsg.includes("timed out") || lowerMsg.includes("etimedout")) {
        errorCategory = "TIMEOUT_ERROR";
        suggestedRemediation = "Increase request timeout or verify service responsiveness.";
      } else if (lowerMsg.includes("not configured") || lowerMsg.includes("invalid") || lowerMsg.includes("missing")) {
        errorCategory = "CONFIGURATION_ERROR";
        suggestedRemediation = "Check and update node configuration parameters in the workflow.";
      } else if (lowerMsg.includes("auth") || lowerMsg.includes("token") || lowerMsg.includes("unauthorized") || lowerMsg.includes("401") || lowerMsg.includes("403")) {
        errorCategory = "AUTH_ERROR";
        suggestedRemediation = "Verify authentication tokens, API keys, and authorization permissions.";
      } else if (lowerMsg.includes("llm") || lowerMsg.includes("quota") || lowerMsg.includes("rate limit")) {
        errorCategory = "LLM_ERROR";
        suggestedRemediation = "Check LLM API quota, rate limits, and model configuration.";
      }

      const parentTask = ns.taskId
        ? [ns.taskId, taskStatuses[ns.taskId]]
        : Object.entries(taskStatuses).find(
            ([taskId, st]) => {
              const t = this.workspaceData.tasks?.find((x: { id: string }) => x.id === taskId);
              return (t?.executorId === ns.workflowId || t?.id === ns.taskId) && st.status === "failed";
            }
          ) ?? Object.entries(taskStatuses).find(([_taskId, st]) => st.status === "failed");

      rootCauses.push({
        source: "workflow_node",
        taskId: ns.taskId ?? (parentTask ? parentTask[0] : undefined),
        workflowId: ns.workflowId,
        nodeId: ns.nodeId,
        nodeTitle: ns.name,
        errorCategory,
        message: msg,
        failedInput: ns.inputs,
        suggestedRemediation,
      });
    }

    if (rootCauses.length === 0) {
      for (const [taskId, st] of Object.entries(taskStatuses)) {
        if (st.status === "failed") {
          const t = this.workspaceData.tasks.find((x: { id: string }) => x.id === taskId);
          const msg = st.reason ?? "Task execution failed";
          rootCauses.push({
            source: t?.type === "workflow" ? "workflow_node" : "task",
            taskId,
            errorCategory: "RUNTIME_ERROR",
            message: msg,
            suggestedRemediation: "Review task instructions, assigned executor, and error logs.",
          });
        }
      }
    }

    const impactedTasks: Array<{ taskId: string; title?: string; impact: "BLOCKED"; reason?: string }> = [];
    for (const [taskId, st] of Object.entries(taskStatuses)) {
      if (st.status === "blocked") {
        const t = this.workspaceData.tasks.find((x: { id: string }) => x.id === taskId);
        impactedTasks.push({
          taskId,
          title: t?.title,
          impact: "BLOCKED",
          reason: st.reason,
        });
      }
    }

    return {
      hasFailures,
      rootCauses,
      impactedTasks,
    };
  }

  /**
   * Persists workspace execution outputs to text and optional JSON sidecar files,
   * generates capability tokens, and emits a workspace_artifacts event.
   */
  private async saveResults(
    layers: { taskId: string }[],
    results: Record<string, string>,
    taskStatuses: Record<string, { status: string; reason?: string }> = {},
    workspaceStatus: "completed" | "failed" | "partial_success" | "aborted" = "completed",
    statusReason: string = "Workspace completed successfully.",
    summary: {
      totalTasks: number;
      succeededTasks: number;
      failedTasks: number;
      blockedTasks: number;
    } = { totalTasks: layers.length, succeededTasks: layers.length, failedTasks: 0, blockedTasks: 0 },
    exitStatus: "success" | "aborted" | "blocked" | "validation_error" = "success",
    validationError?: string
  ) {
    try {
      const outputDir = "Output";
      await mkdir(outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const workspaceName = this.workspaceData.name.replaceAll(" ", "_");
      const filename = `${workspaceName}_${timestamp}.txt`;

      const filepath = join(outputDir, filename);

      const taskTextLines = layers
        .map((l) => {
          const st = taskStatuses[l.taskId];
          if (st?.status === "failed") {
            return `${l.taskId}\n[FAILED] ${st.reason ?? "Task failed"}\n`;
          }
          if (st?.status === "blocked") {
            return `${l.taskId}\n[BLOCKED] ${st.reason ?? "Blocked by upstream dependency"}\n`;
          }
          return `${l.taskId}\n${results[l.taskId]}\n`;
        })
        .join("\n");

      const output = `${this.workspaceData.name} Workspace Execution Results
Generated: ${new Date().toISOString()}
MainLLM: ${this.workspaceData.mainLLM?.provider} -- ${
        this.workspaceData.mainLLM?.model?.name
      }
Agents LLMs: ${this.workspaceData.agents
        ?.map((a) => `${a.name} -- ${a.llm?.provider} ${a.llm?.model?.name}`)
        ?.join(", ")}

${taskTextLines}
__meta__: ${results["__meta__"]}
`;

      await writeFile(filepath, output, "utf8");

      const tokenManager = OutputTokenManager.getInstance();
      const txtToken = tokenManager.generateToken(filename);
      const artifacts: Array<{
        filename: string;
        format: "text" | "json";
        downloadUrl: string;
        viewUrl: string;
      }> = [
        {
          filename,
          format: "text",
          downloadUrl: `/output/download/${encodeURIComponent(filename)}?token=${txtToken}`,
          viewUrl: `/output/view/${encodeURIComponent(filename)}?token=${txtToken}`,
        },
      ];

      // Optional structured sidecar file (same process) controlled by env var
      if (process.env.YALLMA3_OUTPUT_JSON === "1" || process.env.YALLMA3_OUTPUT_JSON === "true") {
        const jsonFilename = `${workspaceName}_${timestamp}.json`;
        const jsonPath = join(outputDir, jsonFilename);

        const socketToTask = new Map<number, string>();
        for (const t of this.workspaceData.tasks ?? []) {
          for (const s of t.sockets ?? []) {
            socketToTask.set(s.id, t.id);
          }
        }
        const taskConnections = (this.workspaceData.connections ?? [])
          .map((c) => {
            const fromTask =
              (c as unknown as { fromTask?: string }).fromTask ??
              (c.fromSocket !== undefined ? socketToTask.get(c.fromSocket) : undefined);
            const toTask =
              (c as unknown as { toTask?: string }).toTask ??
              (c.toSocket !== undefined ? socketToTask.get(c.toSocket) : undefined);
            return { fromTask, toTask };
          })
          .filter((c): c is { fromTask: string; toTask: string } => Boolean(c.fromTask && c.toTask));

        const jsonPayload = {
          workspace: this.workspaceData.name,
          status: workspaceStatus,
          statusReason,
          summary,
          taskConnections,
          workflows: this.tracer.getWorkflows(),
          generatedAt: new Date().toISOString(),
          mainLLM: {
            provider: this.workspaceData.mainLLM?.provider,
            model: this.workspaceData.mainLLM?.model?.name,
            modelId: this.workspaceData.mainLLM?.model?.id,
          },
          agents: (this.workspaceData.agents ?? []).map((a) => ({
            id: a.id,
            name: a.name,
            role: a.role,
            background: a.background,
            systemPrompt: a.systemPrompt,
            provider: a.llm?.provider,
            model: a.llm?.model?.name,
            modelId: a.llm?.model?.id,
            tools: a.tools ?? [],
          })),
          tasks: layers.map((l) => {
            const t = this.workspaceData.tasks?.find((x: { id: string }) => x.id === l.taskId);
            const st = taskStatuses[l.taskId];
            return {
              taskId: l.taskId,
              title: t?.title,
              type: t?.type,
              role: t?.role,
              description: t?.description,
              systemPrompt: t?.systemPrompt,
              expectedOutput: t?.expectedOutput,
              executorId: t?.executorId,
              status: st?.status ?? "unknown",
              reason: st?.reason ?? null,
              result: results[l.taskId] ?? null,
            };
          }),
          diagnostics: this.buildDiagnostics(taskStatuses, validationError),
          steps: this.tracer.getSteps(),
          llmInteractions: this.tracer.getLLMInteractions(),
          logs: this.tracer.getLogs(),
          finalResult: results["__final__"] ?? null,
          exitStatus,
          version: this.version,
          layerCount: layers.length,
          meta: results["__meta__"],
        };
        await writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2), "utf8");
        const jsonToken = tokenManager.generateToken(jsonFilename);
        artifacts.push({
          filename: jsonFilename,
          format: "json",
          downloadUrl: `/output/download/${encodeURIComponent(jsonFilename)}?token=${jsonToken}`,
          viewUrl: `/output/view/${encodeURIComponent(jsonFilename)}?token=${jsonToken}`,
        });
        this.emitInfo(`Results saved to ${jsonPath}`);
      }

      this.emitInfo(`Results saved to ${filepath}`);

      // Emit structured workspace_artifacts event to WebSocket client
      this.ctx.send({
        type: "workspace_artifacts",
        requestId: this.ctx.requestId,
        data: {
          workspace: this.workspaceData.name,
          workspaceId: this.workspaceId,
          artifacts,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.emitErrorRaw("Failed to save results", error);
    }
  }

  // HELPERS — WebSocket Emitters

  private emit(type: string, message: string, results?: string, code?: string) {
    this.tracer.recordLog({
      level:
        type === "system" || type === "info" || type === "success" || type === "error" || type === "warn"
          ? (type as "system" | "info" | "success" | "error" | "warn")
          : "info",
      message,
      details: results,
    });
    if (this.aborted && type != "error") return;
    this.ctx.send({
      type: "message",
      requestId: this.ctx.requestId,
      commandType: "run_workspace" as const,
      code,
      data: {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type,
        message,
        results,
      },
    });
  }

  private emitSystem(msg: string) {
    this.emit("system", msg);
  }

  private emitInfo(msg: string) {
    this.emit("info", msg);
  }

  private emitSuccess(
    step: number,
    total: number,
    title: string,
    results: Record<string, string>
  ) {
    this.emit(
      "success",
      `[${step}/${total}] Task '${title}' completed successfully.`,
      JSON.stringify(results, null, 2)
    );
  }

  private emitSuccessRaw(message: string, results?: string) {
    this.emit("success", message, results);
  }

  private emitError(step: number, total: number, title: string, reason?: string) {
    const detail = reason ? `: ${reason}` : ".";
    const errorMsg = `[${step}/${total}] Task '${title}' failed${detail}`;
    console.error(`[Workspace Error] ${errorMsg}`);
    this.ctx.send({
      type: "error",
      requestId: this.ctx.requestId,
      commandType: "run_workspace" as const,
      code: "EXECUTION_ERROR" as const,
      message: errorMsg,
      timestamp: new Date().toISOString(),
    });
  }

  private emitErrorRaw(
    message: string,
    err: unknown = null,
    showError: boolean = true
  ) {
    const fullMsg = `${message} ${
      showError ? (err ? String(err) : ": Unknown error") : ""
    }`.trim();
    console.error(`[Workspace Error] ${fullMsg}`);
    this.ctx.send({
      type: "error",
      requestId: this.ctx.requestId,
      commandType: "run_workspace" as const,
      code: "EXECUTION_ERROR" as const,
      message: fullMsg,
      timestamp: new Date().toISOString(),
    });
  }

  private emitWorkspaceStopped(reason?: string) {
    this.ctx.send({
      type: "workspace_stopped",
      requestId: this.ctx.requestId,
      data: {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        message: reason
          ? `Workspace execution stopped: ${reason}`
          : "Workspace execution stopped",
      },
    });
  }
}
