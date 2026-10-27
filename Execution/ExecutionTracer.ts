import type { Workflow } from "../Models/Workflow";
import type { WorkspaceData } from "../Models/Workspace";
import type { BaseNode, Connection } from "../Workflow/types/types";
import type { LLMProvider } from "../Models/LLM";

export interface CleanSocket {
  id: number;
  name: string;
  dataType?: string;
}

export interface CleanNode {
  id: number;
  type: string;
  title: string;
  category?: string;
  config?: Record<string, unknown>;
  nodeValue?: unknown;
  inputs: CleanSocket[];
  outputs: CleanSocket[];
}

export interface CleanConnection {
  fromNodeId: number;
  fromSocket: number;
  fromSocketTitle: string;
  toNodeId: number;
  toSocket: number;
  toSocketTitle: string;
}

export interface CleanWorkflowGraph {
  id: string;
  name: string;
  description?: string;
  nodes: CleanNode[];
  connections: CleanConnection[];
}

export interface LLMCallerContext {
  source: "main_agent" | "agent" | "workflow_node" | "system";
  name?: string;
  taskId?: string;
  workflowId?: string;
  nodeId?: number;
  action?: string;
}

export interface LLMInteraction {
  id: string;
  timestamp: string;
  caller: LLMCallerContext;
  provider: string;
  model: string;
  prompt?: string;
  messages?: unknown[];
  response: string;
  toolCalls?: unknown[];
  durationMs?: number;
}

export interface ExecutionStep {
  stepIndex: number;
  timestamp: string;
  type: "task" | "agent_iteration" | "workflow_node" | "system";
  name: string;
  status: "started" | "success" | "failed" | "skipped" | "blocked";
  taskId?: string;
  workflowId?: string;
  nodeId?: number;
  durationMs?: number;
  inputs?: unknown;
  output?: unknown;
  details?: unknown;
}

export interface ExecutionLog {
  timestamp: string;
  level: "info" | "system" | "success" | "error";
  message: string;
  details?: unknown;
}

/**
 * Sanitizes input and output payloads to ensure clean, serializable structures
 * without circular references or non-serializable types.
 */
function safeSanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[Truncated: max depth reached]";
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (t === "function") return undefined;
  if (t === "symbol" || t === "bigint") return String(value);

  if (Array.isArray(value)) {
    return value.map((item) => safeSanitizeValue(item, depth + 1));
  }

  if (t === "object") {
    // Avoid DOM nodes, streams, sockets
    if (typeof (value as { pipe?: unknown }).pipe === "function") {
      return "[Stream]";
    }
    const cleanObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "function") continue;
      cleanObj[k] = safeSanitizeValue(v, depth + 1);
    }
    return cleanObj;
  }

  return String(value);
}

/**
 * Transforms a raw or hydrated Workflow object into a clean, machine-readable
 * graph representation stripped of UI clutter (coordinates, visual flags, i18n maps).
 */
export function sanitizeWorkflowGraph(workflow: Workflow): CleanWorkflowGraph {
  const socketToNodeMap = new Map<number, { nodeId: number; title: string }>();

  // Index sockets across all nodes
  for (const node of workflow.nodes ?? []) {
    for (const s of node.sockets ?? []) {
      socketToNodeMap.set(s.id, { nodeId: node.id, title: s.title });
    }
  }

  const cleanNodes: CleanNode[] = (workflow.nodes ?? []).map((node: BaseNode) => {
    const inputs: CleanSocket[] = [];
    const outputs: CleanSocket[] = [];

    for (const s of node.sockets ?? []) {
      const cleanSocket: CleanSocket = {
        id: s.id,
        name: s.title,
        ...(s.dataType ? { dataType: s.dataType } : {}),
      };
      if (s.type === "input") {
        inputs.push(cleanSocket);
      } else {
        outputs.push(cleanSocket);
      }
    }

    // Extract clean configuration parameters as key-value pairs
    const config: Record<string, unknown> = {};
    const rawParams =
      typeof node.getConfigParameters === "function"
        ? node.getConfigParameters()
        : node.configParameters;

    if (Array.isArray(rawParams)) {
      for (const param of rawParams) {
        if (!param || !param.parameterName) continue;
        config[param.parameterName] =
          param.paramValue !== undefined ? param.paramValue : param.defaultValue;
      }
    }

    const cleanNode: CleanNode = {
      id: node.id,
      type: node.nodeType,
      title: node.title,
      inputs,
      outputs,
    };

    if (node.category) {
      cleanNode.category = node.category;
    }
    if (Object.keys(config).length > 0) {
      cleanNode.config = config;
    }
    if (node.nodeValue !== undefined && node.nodeValue !== null) {
      cleanNode.nodeValue = safeSanitizeValue(node.nodeValue);
    }

    return cleanNode;
  });

  const cleanConnections: CleanConnection[] = (workflow.connections ?? []).map(
    (conn: Connection) => {
      const from = socketToNodeMap.get(conn.fromSocket);
      const to = socketToNodeMap.get(conn.toSocket);
      return {
        fromNodeId: from?.nodeId ?? 0,
        fromSocket: conn.fromSocket,
        fromSocketTitle: from?.title ?? "",
        toNodeId: to?.nodeId ?? 0,
        toSocket: conn.toSocket,
        toSocketTitle: to?.title ?? "",
      };
    }
  );

  return {
    id: String(workflow.id),
    name: workflow.name,
    ...(workflow.description ? { description: workflow.description } : {}),
    nodes: cleanNodes,
    connections: cleanConnections,
  };
}

/**
 * Returns true when YALLMA3_OUTPUT_JSON is set to "1" or "true",
 * indicating structured JSON sidecar output and verbose stdio output are enabled.
 */
export function isVerboseOutputJson(): boolean {
  return process.env.YALLMA3_OUTPUT_JSON === "1" || process.env.YALLMA3_OUTPUT_JSON === "true";
}

/**
 * Verbously prints the received clean workflow graph to stdio when YALLMA3_OUTPUT_JSON is enabled.
 */
export function logVerboseWorkflowGraph(workflow: Workflow): void {
  if (isVerboseOutputJson()) {
    const clean = sanitizeWorkflowGraph(workflow);
    console.log(
      `[Workflow Graph Received] '${workflow.name || workflow.id}':\n${JSON.stringify(
        clean,
        null,
        2
      )}`
    );
  }
}

/**
 * Verbously prints the received workspace graph and workflows to stdio when YALLMA3_OUTPUT_JSON is enabled.
 */
export function logVerboseWorkspaceGraph(
  workspaceData: WorkspaceData,
  workflows: CleanWorkflowGraph[]
): void {
  if (isVerboseOutputJson()) {
    console.log(
      `[Workspace Graph Received] '${workspaceData.name}':\n${JSON.stringify(
        {
          workspace: workspaceData.name,
          tasks: workspaceData.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            type: t.type,
            executorId: t.executorId,
          })),
          connections: workspaceData.connections,
          workflows,
        },
        null,
        2
      )}`
    );
  }
}

export class ExecutionTracer {
  private workflows = new Map<string, CleanWorkflowGraph>();
  private steps: ExecutionStep[] = [];
  private llmInteractions: LLMInteraction[] = [];
  private logs: ExecutionLog[] = [];
  private stepCounter = 0;

  /**
   * Records or updates a clean workflow graph definition.
   */
  recordWorkflow(workflow: Workflow): void {
    if (!workflow || !workflow.id) return;
    const cleanGraph = sanitizeWorkflowGraph(workflow);
    this.workflows.set(cleanGraph.id, cleanGraph);
  }

  /**
   * Returns all recorded clean workflow graphs.
   */
  getWorkflows(): CleanWorkflowGraph[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Records an execution step.
   */
  recordStep(step: Omit<ExecutionStep, "stepIndex" | "timestamp"> & { timestamp?: string }): void {
    this.stepCounter++;
    const stepEntry: ExecutionStep = {
      stepIndex: this.stepCounter,
      timestamp: step.timestamp ?? new Date().toISOString(),
      type: step.type,
      name: step.name,
      status: step.status,
      ...(step.taskId ? { taskId: step.taskId } : {}),
      ...(step.workflowId ? { workflowId: step.workflowId } : {}),
      ...(step.nodeId !== undefined ? { nodeId: step.nodeId } : {}),
      ...(step.durationMs !== undefined ? { durationMs: step.durationMs } : {}),
      ...(step.inputs !== undefined ? { inputs: safeSanitizeValue(step.inputs) } : {}),
      ...(step.output !== undefined ? { output: safeSanitizeValue(step.output) } : {}),
      ...(step.details !== undefined ? { details: safeSanitizeValue(step.details) } : {}),
    };
    this.steps.push(stepEntry);

    if (isVerboseOutputJson()) {
      const dur = stepEntry.durationMs !== undefined ? ` (${stepEntry.durationMs}ms)` : "";
      console.log(`[Step ${stepEntry.stepIndex}] [${stepEntry.type}] '${stepEntry.name}': ${stepEntry.status}${dur}`);
    }
  }

  /**
   * Returns all recorded execution steps.
   */
  getSteps(): ExecutionStep[] {
    return [...this.steps];
  }

  /**
   * Records an LLM interaction.
   */
  recordLLMInteraction(interaction: LLMInteraction): void {
    const entry: LLMInteraction = {
      ...interaction,
      prompt: interaction.prompt,
      messages: interaction.messages
        ? (safeSanitizeValue(interaction.messages) as unknown[])
        : undefined,
      response: interaction.response,
      toolCalls: interaction.toolCalls
        ? (safeSanitizeValue(interaction.toolCalls) as unknown[])
        : undefined,
    };
    this.llmInteractions.push(entry);

    if (isVerboseOutputJson()) {
      const callerStr = `${entry.caller.source}${entry.caller.action ? `:${entry.caller.action}` : ""}`;
      const dur = entry.durationMs !== undefined ? ` (${entry.durationMs}ms)` : "";
      console.log(`[LLM Interaction] [${entry.provider}/${entry.model}] [${callerStr}]${dur}`);
    }
  }

  /**
   * Returns all recorded LLM interactions.
   */
  getLLMInteractions(): LLMInteraction[] {
    return [...this.llmInteractions];
  }

  /**
   * Records an execution log entry.
   */
  recordLog(log: Omit<ExecutionLog, "timestamp"> & { timestamp?: string }): void {
    this.logs.push({
      timestamp: log.timestamp ?? new Date().toISOString(),
      level: log.level,
      message: log.message,
      ...(log.details !== undefined ? { details: safeSanitizeValue(log.details) } : {}),
    });
  }

  /**
   * Returns all recorded execution logs.
   */
  getLogs(): ExecutionLog[] {
    return [...this.logs];
  }

  /**
   * Wraps an LLMProvider instance with transparent tracing.
   * Intercepts `generateText` and `callLLM` to capture prompts, completions,
   * tool calls, model info, and durationMs.
   */
  wrapLLM(
    provider: LLMProvider,
    caller: LLMCallerContext,
    meta?: { providerName?: string; modelName?: string }
  ): LLMProvider {
    const providerName =
      meta?.providerName ??
      (provider as unknown as { provider?: string }).provider ??
      "unknown";
    const modelName =
      meta?.modelName ??
      (provider as unknown as { model?: string }).model ??
      "unknown";

    const recordInteraction = (interaction: LLMInteraction) => {
      this.recordLLMInteraction(interaction);
    };

    return new Proxy(provider, {
      get(target, prop, receiver) {
        if (prop === "generateText") {
          return async (prompt: string): Promise<string> => {
            const start = Date.now();
            let response = "";
            try {
              response = await target.generateText(prompt);
              recordInteraction({
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                caller,
                provider: providerName,
                model: modelName,
                prompt,
                response,
                durationMs: Date.now() - start,
              });
              return response;
            } catch (err) {
              recordInteraction({
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                caller,
                provider: providerName,
                model: modelName,
                prompt,
                response: `Error: ${err instanceof Error ? err.message : String(err)}`,
                durationMs: Date.now() - start,
              });
              throw err;
            }
          };
        }

        if (prop === "callLLM" && typeof target.callLLM === "function") {
          return async (messages: unknown[]): Promise<unknown> => {
            const start = Date.now();
            try {
              const res = await target.callLLM!(messages as never);
              recordInteraction({
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                caller,
                provider: providerName,
                model: modelName,
                messages,
                response: res.content || "",
                toolCalls: res.toolCalls ?? undefined,
                durationMs: Date.now() - start,
              });
              return res;
            } catch (err) {
              recordInteraction({
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                caller,
                provider: providerName,
                model: modelName,
                messages,
                response: `Error: ${err instanceof Error ? err.message : String(err)}`,
                durationMs: Date.now() - start,
              });
              throw err;
            }
          };
        }

        return Reflect.get(target, prop, receiver);
      },
    });
  }
}
