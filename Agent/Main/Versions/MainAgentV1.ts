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
      return {};
    }

    await this.initialize();
    if (this.aborted) {
      console.warn(`[Workspace Aborted] Initialization failed or LLM unreachable.`);
      return {};
    }

    const results: Record<string, string> = {};
    const taskStatuses: Record<string, { status: string; reason?: string }> = {};
    const layers = this.createTaskLayers();
    const MainLLM = this.createLLM();

    let step = 1;

    for (const layer of layers) {
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

      this.emitSystem(
        `Assigned task '${task.title}' to ${bestFit.type} '${
          bestFit.name
        }' (confidence ${bestFit.confidence.toFixed(2)}).`
      );
    }

    return bestFit;
  }

  private isWorkflow(task: Task, bestFit: BestFitAssignment | null) {
    return task.type === "workflow" || bestFit?.type === "workflow";
  }

  // STAGE 4: WORKFLOW EXECUTION

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
        this.tracer
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
        this.emitError(layerIndex, totalLayers, task.title);
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
    if (this.aborted) return;
    const finalTaskId = layers[layers.length - 1]?.taskId ?? "";
    const finalResult =
      (finalTaskId && results[finalTaskId]) || JSON.stringify(results, null, 2);

    results["__meta__"] = JSON.stringify({
      version: this.version,
      timestamp: Date.now(),
    });
    results["__final__"] = finalResult;

    console.log(`✅ Workspace '${this.workspaceData.name}' completed successfully.`);
    this.emitSuccessRaw("Workspace completed successfully.", finalResult);
    this.emitWorkspaceStopped();
    await this.saveResults(layers, results, taskStatuses);
  }

  private async saveResults(
    layers: { taskId: string }[],
    results: Record<string, string>,
    taskStatuses: Record<string, { status: string; reason?: string }> = {}
  ) {
    try {
      const outputDir = "Output";
      await mkdir(outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const workspaceName = this.workspaceData.name.replaceAll(" ", "_");
      const filename = `${workspaceName}_${timestamp}.txt`;

      const filepath = join(outputDir, filename);

      const output = `${this.workspaceData.name} Workspace Execution Results
Generated: ${new Date().toISOString()}
MainLLM: ${this.workspaceData.mainLLM.provider} -- ${
        this.workspaceData.mainLLM.model.name
      }
Agents LLMs: ${this.workspaceData.agents
        .map((a) => `${a.name} -- ${a.llm.provider} ${a.llm.model.name}`)
        .join(", ")}

${layers.map((l) => `${l.taskId}\n${results[l.taskId]}\n`).join("\n")}
__meta__: ${results["__meta__"]}
`;

      await writeFile(filepath, output, "utf8");

      const tokenManager = OutputTokenManager.getInstance();
      const workspaceTtl =
        this.workspaceData.settings?.outputTokenTtl ??
        (this.workspaceData as { outputTokenTtl?: string | number }).outputTokenTtl;
      const workspaceMaxUses =
        this.workspaceData.settings?.outputTokenMaxUses ??
        (this.workspaceData as { outputTokenMaxUses?: number }).outputTokenMaxUses;

      const tokenOptions =
        workspaceTtl !== undefined || workspaceMaxUses !== undefined
          ? {
              ttlMs: workspaceTtl,
              maxUses: workspaceMaxUses,
            }
          : undefined;

      const txtToken = tokenManager.generateToken(filename, tokenOptions);
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
        const jsonPayload = {
          workspace: this.workspaceData.name,
          workflows: this.tracer.getWorkflows(),
          generatedAt: new Date().toISOString(),
          mainLLM: {
            provider: this.workspaceData.mainLLM.provider,
            model: this.workspaceData.mainLLM.model.name,
            modelId: this.workspaceData.mainLLM.model.id,
          },
          agents: this.workspaceData.agents.map((a) => ({
            id: a.id,
            name: a.name,
            role: a.role,
            provider: a.llm.provider,
            model: a.llm.model.name,
            modelId: a.llm.model.id,
          })),
          tasks: layers.map((l) => {
            const t = this.workspaceData.tasks.find((x: { id: string }) => x.id === l.taskId);
            return {
              taskId: l.taskId,
              title: t?.title,
              executorId: t?.executorId,
              status: taskStatuses[l.taskId]?.status ?? "unknown",
              result: results[l.taskId],
            };
          }),
          steps: this.tracer.getSteps(),
          llmInteractions: this.tracer.getLLMInteractions(),
          logs: this.tracer.getLogs(),
          finalResult: results["__final__"],
          aborted: this.aborted,
          version: this.version,
          layerCount: layers.length,
          meta: results["__meta__"],
        };
        await writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2), "utf8");
        const jsonToken = tokenManager.generateToken(jsonFilename, tokenOptions);
        artifacts.push({
          filename: jsonFilename,
          format: "json",
          downloadUrl: `/output/download/${encodeURIComponent(jsonFilename)}?token=${jsonToken}`,
          viewUrl: `/output/view/${encodeURIComponent(jsonFilename)}?token=${jsonToken}`,
        });
        this.emitSuccessRaw(`Results saved to ${jsonPath}`);
      }

      this.emitSuccessRaw(`Results saved to ${filepath}`);

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

  private emit(type: string, message: string, results?: string) {
    this.tracer.recordLog({
      level:
        type === "system" || type === "info" || type === "success" || type === "error"
          ? type
          : "info",
      message,
      details: results,
    });
    if (this.aborted && type != "error") return;
    this.ctx.send({
      type: "message",
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

  private emitError(step: number, total: number, title: string) {
    const errorMsg = `[${step}/${total}] Task '${title}' failed.`;
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
