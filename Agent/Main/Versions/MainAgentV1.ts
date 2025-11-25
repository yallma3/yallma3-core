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
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { workflowExecutor } from "../../Utls/ToolCallingHelper";
import type { WorkspaceData } from "../../../Models/Workspace";
import { Yallma3GenOneAgentRuntime } from "../../Agent";
import { getLLMProvider } from "../../../LLM/LLMRunner";
import { WebSocket } from "ws";
import type { LLMProvider } from "../../../Models/LLM";

export class MainAgentV1 implements MainAgent {
  version = "1.0.0";

  constructor(private workspaceData: WorkspaceData, private ws: WebSocket) {}

  async run(): Promise<Record<string, string>> {
    if (!this.workspaceData) return {};

    await this.initialize();

    const results: Record<string, string> = {};
    const layers = this.createTaskLayers();
    const MainLLM = this.createLLM();

    let step = 1;

    for (const layer of layers) {
      const task = this.getTask(layer.taskId);
      if (!task) continue;

      const taskContext = this.buildTaskContext(layer, results);

      const bestFit = await this.assignIfNeeded(task, MainLLM);

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

      const coreAnalysis = await this.analyzeTaskCore(
        MainLLM,
        task,
        taskContext
      );
      const agentPlan = await this.createAgentPlan(
        MainLLM,
        task,
        coreAnalysis,
        taskContext
      );

      const agentResult = await this.runAgent(task, agentPlan, taskContext);

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

  // STAGE 1: INITIALIZATION

  private async initialize() {
    this.emitSystem("Main agent initializing...");
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

  private async assignIfNeeded(task: Task, llm: LLMProvider) {
    if (task.type !== "agentic") return null;

    this.emitSystem(`Assigning task '${task.title}'...`);

    const bestFit = await assignBestFit(
      llm,
      task,
      this.workspaceData.workflows,
      this.workspaceData.agents
    );

    this.emitSystem(
      `Assigned task '${task.title}' to ${bestFit.type} '${
        bestFit.id
      }' (confidence ${bestFit.confidence.toFixed(2)}).`
    );

    return bestFit;
  }

  private isWorkflow(
    task: Task,
    bestFit: {
      type: "workflow" | "agent" | "mcp";
      id: string;
      confidence: number;
      reasoning: string;
    } | null
  ) {
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
    bestFit: {
      type: "workflow" | "agent" | "mcp";
      id: string;
      confidence: number;
      reasoning: string;
    } | null;
    taskContext: string;
    results: Record<string, string>;
  }) {
    const workflowId = task.type === "workflow" ? task.executorId : bestFit?.id;
    if (!workflowId) throw new Error("Missing workflow ID");

    this.emitInfo(
      `[${layerIndex}/${totalLayers}] Running task '${task.title}' (workflow: ${workflowId})`
    );

    const finalResult = await workflowExecutor(
      this.ws,
      workflowId,
      taskContext
    );

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

  private async runAgent(task: Task, plan: AgentStep[], context: string) {
    const agentId = task.type === "specific-agent" ? task.executorId : null;

    const agent = this.workspaceData.agents.find((a) => a.id === agentId);
    if (!agent) return null;

    this.emitInfo(`Running agent '${agent.name}' for '${task.title}'`);

    const runtime = new Yallma3GenOneAgentRuntime(
      agent,
      task,
      context,
      plan,
      this.ws,
      this.workspaceData.apiKey,
      this.workspaceData.mainLLM
    );

    return runtime.run();
  }

  // STAGE 6: FINALIZE

  private async finalize(
    layers: { taskId: string }[],
    results: Record<string, string>
  ) {
    const finalTaskId = layers[layers.length - 1]?.taskId ?? "";
    const finalResult =
      (finalTaskId && results[finalTaskId]) || JSON.stringify(results, null, 2);

    this.emitSuccessRaw("Workspace completed successfully.", finalResult);

    await this.saveResults(layers, results);

    results["__meta__"] = JSON.stringify({
      version: this.version,
      timestamp: Date.now(),
    });
  }

  private async saveResults(
    layers: { taskId: string }[],
    results: Record<string, string>
  ) {
    try {
      const outputDir = "Output";
      await mkdir(outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const workspaceName = this.workspaceData.name.replace(" ", "_");
      const filename = `${workspaceName}_${timestamp}.txt`;

      const filepath = join(outputDir, filename);

      const output = `${this.workspaceData.name} Workspace Execution Results
Generated: ${new Date().toISOString()}

${layers.map((l) => `${l.taskId}\n${results[l.taskId]}\n`).join("\n")}
`;

      await writeFile(filepath, output, "utf8");

      this.emitSuccessRaw(`Results saved to ${filepath}`);
    } catch (error) {
      this.emitErrorRaw("Failed to save results", error);
    }
  }

  // HELPERS — WebSocket Emitters

  private emit(type: string, message: string, results?: string) {
    const event = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type,
      message,
      results,
    };

    this.ws.send(JSON.stringify({ type: "message", data: event }));
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
    this.emit("error", `[${step}/${total}] Task '${title}' failed.`);
  }

  private emitErrorRaw(message: string, err: unknown = null) {
    this.emit("error", `${message}: ${err ? String(err) : "Unknown error"}`);
  }
}
