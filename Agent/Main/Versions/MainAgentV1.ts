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

export class MainAgentV1 implements MainAgent {
  version = "1.0.0";
  private aborted = false;
  private currentWorkflowId: string | null = null;
  private workspaceId: string;

  constructor(
    workspaceData: WorkspaceData,
    private ctx: ExecutionContext,
    private triggerData?: unknown
  ) {
    const repo = WorkspaceRepository.getInstance();
    repo.set(workspaceData.id, workspaceData);
    repo.setCurrent(workspaceData.id);
    this.workspaceId = workspaceData.id;
  }

  private get workspaceData(): WorkspaceData {
    return WorkspaceRepository.getInstance().get(this.workspaceId)!;
  }

  async run(): Promise<Record<string, string>> {
    if (!this.workspaceData) return {};

    const validation = validateWorkspace(this.workspaceData);
    if (!validation.valid) {
      this.emitErrorRaw(validation.error.message, null, false);
      return {};
    }

    await this.initialize();
    if (this.aborted) return {};

    const results: Record<string, string> = {};
    const layers = this.createTaskLayers();
    const MainLLM = this.createLLM();

    let step = 1;

    for (const layer of layers) {
      if (this.aborted) break;

      const task = this.getTask(layer.taskId);
      if (!task) continue;

      const taskContext = this.buildTaskContext(layer, results);

      const bestFit = await this.assignIfNeeded(task, MainLLM);

      if (!bestFit) {
        this.emitErrorRaw(
          `Task '${task.title}' could not be assigned to any executor. Aborting.`,
          null,
          false
        );
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
        results[task.id] = agentResult;
        this.emitSuccess(step, layers.length, task.title, {
          result: agentResult,
        });
      } else {
        this.emitError(step, layers.length, task.title);
      }

      step++;
    }

    await this.finalize(layers, results);
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
    layer: { context: string[] },
    results: Record<string, string>
  ) {
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

      bestFit = await assignBestFit(
        llm,
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
  }: {
    task: Task;
    layerIndex: number;
    totalLayers: number;
    bestFit: BestFitAssignment | null;
    taskContext: string;
    results: Record<string, string>;
  }) {
    if (this.aborted) return;

    // if bestFit is not null then we have decided already, bestFit could be the same task.executorId
    const workflowId = bestFit ? bestFit.id : task.executorId;
    if (!workflowId) {
      this.emitError(layerIndex, totalLayers, task.title);
      return;
    }

    this.emitInfo(
      `[${layerIndex}/${totalLayers}] Running task '${task.title}' (workflow: ${
        bestFit ? bestFit.name : workflowId
      })`
    );

    this.currentWorkflowId = workflowId;
    try {
      const finalResult = await workflowExecutor(
        this.ctx,
        workflowId,
        taskContext,
        this.triggerData
      );
      this.currentWorkflowId = null;

      if (this.aborted) return;
      if (finalResult) {
        results[task.id] =
          typeof finalResult === "string"
            ? finalResult
            : JSON.stringify(finalResult);

        this.emitSuccess(layerIndex, totalLayers, task.title, {
          task: JSON.stringify(finalResult, null, 2),
        });
      } else {
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
      throw err;
    }
  }

  // STAGE 5: AGENT EXECUTION

  private async analyzeTaskCore(llm: LLMProvider, task: Task, context: string) {
    this.emitSystem(`Analysing task '${task.title}'...`);
    return analyzeTaskCore(llm, task, context);
  }

  private async createAgentPlan(
    llm: LLMProvider,
    task: Task,
    coreAnalysis: CoreTaskAnalysis,
    context: string
  ) {
    this.emitInfo(`Creating agent plan...`);

    try {
      const plan = await planAgenticTask(llm, coreAnalysis, task, context);

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
      this.workspaceData.mainLLM
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
    results: Record<string, string>
  ) {
    if (this.aborted) return;
    const finalTaskId = layers[layers.length - 1]?.taskId ?? "";
    const finalResult =
      (finalTaskId && results[finalTaskId]) || JSON.stringify(results, null, 2);

    results["__meta__"] = JSON.stringify({
      version: this.version,
      timestamp: Date.now(),
    });

    console.log(`✅ Workspace '${this.workspaceData.name}' completed successfully.`);
    this.emitSuccessRaw("Workspace completed successfully.", finalResult);
    this.emitWorkspaceStopped();
    await this.saveResults(layers, results);
  }

  private async saveResults(
    layers: { taskId: string }[],
    results: Record<string, string>
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

      // Optional structured sidecar file (same process) controlled by env var
      if (process.env.YALLMA3_OUTPUT_JSON === "1" || process.env.YALLMA3_OUTPUT_JSON === "true") {
        const jsonPath = join(outputDir, `${workspaceName}_${timestamp}.json`);
        const jsonPayload = {
          workspace: this.workspaceData.name,
          workflows: this.workspaceData.workflows.map((w: { id: string; name: string }) => ({ id: w.id, name: w.name })),
          generatedAt: new Date().toISOString(),
          mainLLM: {
            provider: this.workspaceData.mainLLM.provider,
            model: this.workspaceData.mainLLM.model.name,
            modelId: this.workspaceData.mainLLM.model.id,
          },
          agents: this.workspaceData.agents.map((a) => ({
            name: a.name,
            provider: a.llm.provider,
            model: a.llm.model.name,
            modelId: a.llm.model.id,
          })),
          tasks: layers.map((l) => ({ taskId: l.taskId, result: results[l.taskId] })),
          meta: results["__meta__"],
        };
        await writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2), "utf8");
        this.emitSuccessRaw(`Results saved to ${jsonPath}`);
      }

      this.emitSuccessRaw(`Results saved to ${filepath}`);
    } catch (error) {
      this.emitErrorRaw("Failed to save results", error);
    }
  }

  // HELPERS — WebSocket Emitters

  private emit(type: string, message: string, results?: string) {
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
    this.ctx.send({
      type: "error",
      requestId: this.ctx.requestId,
      commandType: "run_workspace" as const,
      code: "EXECUTION_ERROR" as const,
      message: `[${step}/${total}] Task '${title}' failed.`,
      timestamp: new Date().toISOString(),
    });
  }

  private emitErrorRaw(
    message: string,
    err: unknown = null,
    showError: boolean = true
  ) {
    this.ctx.send({
      type: "error",
      requestId: this.ctx.requestId,
      commandType: "run_workspace" as const,
      code: "EXECUTION_ERROR" as const,
      message: `${message} ${
        showError ? (err ? String(err) : ": Unknown error") : ""
      }`,
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
