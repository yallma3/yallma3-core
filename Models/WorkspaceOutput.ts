import type { CleanWorkflowGraph, ExecutionLog, ExecutionStep, LLMInteraction, LLMUsageSummary } from "../Execution/ExecutionTracer";

export type WorkspaceExecutionStatus = "completed" | "failed" | "partial_success" | "aborted";
export type WorkspaceExitStatus = "success" | "aborted" | "blocked" | "validation_error";

export interface WorkspaceOutputMeta {
  workspace: string;
  workspaceId: string;
  version: "2.0.0";
  startTime: string;
  endTime: string;
  durationMs: number;
  generatedAt: string;
  layerCount: number;
  customMeta?: Record<string, unknown> | string | null;
}

export interface WorkspaceExecutionSummary {
  totalTasks: number;
  succeededTasks: number;
  failedTasks: number;
  blockedTasks: number;
}

export interface WorkspaceOutputResult {
  status: WorkspaceExecutionStatus;
  exitStatus: WorkspaceExitStatus;
  statusReason: string;
  summary: WorkspaceExecutionSummary;
  finalOutput: string | null;
}

export interface WorkspaceDiagnosticRootCause {
  source: "workflow_node" | "task" | "workspace_validation";
  taskId?: string;
  workflowId?: string;
  nodeId?: number;
  nodeTitle?: string;
  errorCategory:
    | "CONFIGURATION_ERROR"
    | "TRANSPORT_ERROR"
    | "TIMEOUT"
    | "TIMEOUT_ERROR"
    | "AUTH_ERROR"
    | "LLM_ERROR"
    | "VALIDATION_ERROR"
    | "EXECUTION_ERROR"
    | "RUNTIME_ERROR";
  message: string;
  failedInput?: unknown;
  suggestedRemediation: string;
}

export interface WorkspaceDiagnosticImpactedTask {
  taskId: string;
  title?: string;
  impact: "BLOCKED";
  reason?: string;
}

export interface WorkspaceOutputDiagnostics {
  hasFailures: boolean;
  rootCauses: WorkspaceDiagnosticRootCause[];
  impactedTasks: WorkspaceDiagnosticImpactedTask[];
}

export interface WorkspaceTaskBlueprint {
  taskId: string;
  title?: string;
  type?: string;
  role?: string;
  description?: string;
  systemPrompt?: string;
  expectedOutput?: string;
  executorId?: string;
}

export interface WorkspaceAgentBlueprint {
  id: string;
  name: string;
  role: string;
  background?: string;
  systemPrompt?: string;
  provider?: string;
  model?: string;
  modelId?: string;
  tools?: unknown[];
}

export interface WorkspaceTaskConnectionBlueprint {
  fromTask: string;
  toTask: string;
}

export interface WorkspaceOutputBlueprint {
  mainLLM: {
    provider?: string;
    model?: string;
    modelId?: string;
  };
  agents: WorkspaceAgentBlueprint[];
  workflows: CleanWorkflowGraph[];
  tasks: WorkspaceTaskBlueprint[];
  taskConnections: WorkspaceTaskConnectionBlueprint[];
}

export interface WorkspaceTaskResult {
  status: "success" | "failed" | "blocked" | "unknown";
  reason: string | null;
  durationMs: number;
  output: string | null;
}

export interface WorkspaceOutputTelemetry {
  taskResults: Record<string, WorkspaceTaskResult>;
  steps: ExecutionStep[];
  llmInteractions: LLMInteraction[];
  llmUsage: LLMUsageSummary;
  logs: ExecutionLog[];
}

export interface WorkspaceOutputV2 {
  meta: WorkspaceOutputMeta;
  result: WorkspaceOutputResult;
  diagnostics: WorkspaceOutputDiagnostics;
  blueprint: WorkspaceOutputBlueprint;
  telemetry: WorkspaceOutputTelemetry;
}
