# Agent System (`Agent/`)

## Purpose
Defines the agent runtime that orchestrates workspace execution. Agents process tasks, interact with LLMs, execute workflows, and support abort.

> **ADR**: [research_200626_workspace-validation.md](../research/research_200626_workspace-validation.md)

## Internal Contracts

### MainAgent Interface
```typescript
interface MainAgent {
  version: string;
  run(): Promise<Record<string, string>>;
  abort(): Promise<void>;
}
```
- **Consumer**: `Execution/Orchestrator.ts` (via `createMainAgent()`)
- **Implementation**: `MainAgentV1` (registered under version `"1.0.0"`)

### Abort Pattern
Boolean flag (`aborted`) + `abort(): Promise<void>` method. NOT `AbortController`/`AbortSignal`. The abort signal propagates via `setAbortChecker()`/`checkAbort()` through the execution chain. Additionally, `MainAgentV1.abort()` calls `requestStop()` for any currently running workflow, ensuring that both agent-level and workflow-level execution are stopped by a single `abort()` call.

### sendWorkflow Utility
```typescript
function sendWorkflow(ctx: ExecutionContext, workflowId: string, input?: string, timeoutMs?: number): Promise<string>
```
Sends a `run_workflow` WS message via `ctx.send()`, waits for a `workflow_json` response with matching `requestId`, resolves with the stringified JSON result. Default timeout: 60s. Defined in `Execution/sendWorkflow.ts`.

### MainAgentRegistry
```typescript
const registry: Record<string, MainAgentConstructor> = { "1.0.0": MainAgentV1 };

function getMainAgent(version?: string, ...args: any[]): MainAgent
```
Resolves a version string to a registered constructor and instantiates it. Defaults to `"1.0.0"`.

### Base Agent (`Agent/Agent.ts`)
- Base runtime class with abort support
- Used by legacy agents and as foundation for `MainAgentV1`

## Workspace Validation

`MainAgentV1.run()` validates the incoming `WorkspaceData` before any execution logic. Validation uses pure functions with no external dependencies, short-circuiting on the first error found. Each error includes a human-readable message, a dot-notation path to the source, and a machine-readable error code.

### Validation Types
```typescript
interface ValidationError {
  path: string;     // e.g. "workflows[0].nodes"
  message: string;  // User-facing error description
  code: string;     // e.g. "MISSING_FIELD", "INVALID_REFERENCE", "EMPTY_COLLECTION"
}

type ValidationResult =
  | { valid: true }
  | { valid: false; error: ValidationError };
```

### Validation Rules
| Scope | Rule | Code |
|-------|------|------|
| Root | `id` is a non-empty string | `MISSING_FIELD` |
| Root | `name` is a non-empty string | `MISSING_FIELD` |
| Root | `tasks` is a non-empty array | `EMPTY_COLLECTION` |
| Root | `mainLLM` is a valid object with provider + model | `INVALID_LLM` |
| Task | `type` is `"agentic"`, `"workflow"`, or `"specific-agent"` | `INVALID_ENUM` |
| Task | If type is `"workflow"`, `executorId` matches a workflow | `INVALID_REFERENCE` |
| Task | If type is `"specific-agent"`, `executorId` matches an agent | `INVALID_REFERENCE` |
| Task | Connection socket IDs reference existing task sockets | `INVALID_REFERENCE` |
| Agent | `role` is a non-empty string | `MISSING_FIELD` |
| Agent | `background` is a non-empty string | `MISSING_FIELD` |
| Agent | `llm` is present and valid | `INVALID_LLM` |
| Workflow | `nodes` is a non-empty array | `EMPTY_COLLECTION` |
| Workflow | Each connection references a socket on an existing node | `INVALID_REFERENCE` |
| Workflow | Each node has ≥1 connection involving its sockets | `ORPHAN_NODE` |

### Placement
- Called at the top of `MainAgentV1.run()` before `initialize()`.
- Errors are emitted via `ctx.send()` with `type: "error"`, `code: "VALIDATION_ERROR"`.
- Validation is execution-scoped only (not on `repo.set()`) to avoid coupling storage to validity.

## Startup Health Check (Gate 1)

Before executing any task, `MainAgentV1.initialize()` probes the workspace Main LLM with
`testLLMHealth(this.workspaceData.mainLLM, this.workspaceData.apiKey)` (see [LLM System](system_llm.md)):

```typescript
const health = await testLLMHealth(this.workspaceData.mainLLM, this.workspaceData.apiKey);
if (!health.ok) {
  this.emitErrorRaw("Main LLM unreachable at startup", health.error, true);
  this.aborted = true;
}
```
- `run()` returns early (`if (this.aborted) return {}`) immediately after `await this.initialize()`,
  before `createTaskLayers()`, so the task graph never starts against a dead Main LLM.
- Every run therefore pays one probe round-trip (~200–2000 ms); accepted to fail fast.

### Task-graph Fatal Stop
If the Main LLM dies **during** execution, `executeWithFallback` throws `FatalMainLLMError`, which
surfaces as a returned `Error` from the workflow runtime and is re-thrown by
`ToolCallingHelper.triggeredPath`. `MainAgentV1.executeWorkflowTask` catches it, emits
`emitErrorRaw("Main LLM fatal failure during execution", err.message, true)`, and sets `aborted = true`
— mirroring the workflow-graph stop (see [Workflow Engine](system_workflow.md)).

## Structured Output & ExecutionTracer

When `YALLMA3_OUTPUT_JSON=true` or `1`, `MainAgentV1.saveResults()` generates a clean, machine-readable JSON sidecar file (`Output/<workspaceName>_<timestamp>.json`).

### ExecutionTracer (`Execution/ExecutionTracer.ts`)
- **Workflow Graph Sanitization**: Strips UI clutter (`x, y, width, height, selected, processing`, and i18n maps) and produces clean `{ id, type, title, category, config, inputs, outputs }` nodes and semantic `{ fromNodeId, fromSocket, fromSocketTitle, toNodeId, toSocket, toSocketTitle }` connections.
- **LLM Interaction Interception**: Proxies `LLMProvider` transparently via `tracer.wrapLLM(provider, callerInfo)`, capturing prompts, completions, tool calls, model/provider identity, and execution duration.
- **Granular Step Tracing**: Records task lifecycle, agent iterations (prompting, review, final check), and workflow node executions (inputs, outputs, status: executed/skipped/failed).
- **Output Artifact Notification & Capability Token Gating**: Upon completing file saving in `saveResults()`, `MainAgentV1` issues capability tokens via `OutputTokenManager` and sends a `workspace_artifacts` WebSocket event containing `downloadUrl` and `viewUrl` for all generated output files (`.txt` and `.json`), enabling direct client retrieval without CORS exposure or directory traversal risk.

## File Structure
| File | Role |
|------|------|
| `Agent.ts` | Base agent runtime with abort support and execution tracing |
| `MainAgents.ts` | Legacy main agents |
| `Main/MainAgent.ts` | `MainAgent` interface + `sendWorkflow()` |
| `Main/MainAgentRegistry.ts` | Versioned registry |
| `Main/Versions/MainAgentV1.ts` | v1 implementation (startup health check, task-graph fatal stop, structured sidecar) |
| `Utls/ToolCallingHelper.ts` | Tool calling utilities threaded with `ExecutionTracer` |
| `Validation/WorkspaceValidator.ts` | Workspace validation functions |

## Dependencies
- **Consumes**: `LLMProvider` (via `LLMRunner`), `NodeRegistry`, `executeFlowRuntime()`, `WorkspaceData` models (via `Validation/`)
- **Consumed by**: `Utils/Runtime.ts` (via `createMainAgent`), `Websocket/socket.ts`

## Agent Memory Integration

> **ADR**: [research_260620_agent_capability_memory.md](../research/research_260620_agent_capability_memory.md)

After `AgentRuntime.run()` completes, the system calls `agentMemoryStore.recordOutcome(agent, taskCompletedSuccessfully)` to persist the agent's outcome. Capability tags are added/removed via `addCapabilities`/`removeCapabilities` based on task analysis or LLM review.

The agent memory is a separate subsystem (`Memory/`) with its own data model and persistence. See [Agent Memory System](system_agent_memory.md) for full details.

## See Also
- [LLM System](system_llm.md) — provider contracts
- [Workflow Engine](system_workflow.md) — runtime execution
- [Agent Memory System](system_agent_memory.md) — performance & capability memory
- [Utilities](system_utils.md) — factory contract
