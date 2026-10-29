# WebSocket Server (`Websocket/socket.ts`)

## Purpose
Manages real-time communication between server and frontend clients. Handles workspace execution, workflow execution, abort, trigger registration, user prompts, and console input over WebSocket.

## Internal Contract

### Setup Function
```typescript
function setupWebSocketServer(
  wss: WebSocketServer,
  _instanceId?: string
): {
  broadcast: (message: unknown) => void;
  sendToClient: (ws: WebSocket, message: unknown) => void;
  broadcastCommand: (commandData: { id: string; command: string; data?: unknown }) => void;
  getClientCount: () => number;
}
```

### Globals
```typescript
let globalBroadcast: ((message: unknown) => void) | null;
```

### Error Handling
```typescript
type CommandErrorCode = 'VALIDATION_ERROR' | 'EXECUTION_ERROR' | 'TIMEOUT' | 'NOT_FOUND' | 'INTERNAL_ERROR';

function sendCommandError(
  ws: WebSocket,
  commandType: string,
  code: CommandErrorCode,
  message: string,
  requestId?: string,
): void;
```

## External WebSocket API Contract

### Connection
- **Endpoint**: `ws://<host>:<port>/`
- **Authentication**: When `--instance-id` is provided, client must include `x-api-key` header or `sec-websocket-protocol` with the instance ID value
- **Initial Response**: Server sends `connected` message on successful connection

### Client → Server Messages

| Message Type | Payload | Description |
|--------------|---------|-------------|
| `ping` | `{}` | Heartbeat |
| `run_workspace` | `{ data: WorkspaceData }` | Start workspace execution (workflows normalized via `normalizeWorkspacePayload`) |
| `abort_workspace` | `{}` | Stop running workspace (stops agent + workflow) |
| `run_workflow` | `{ data: WorkflowData }` | Execute a workflow directly (normalized via `normalizeWorkflowPayload`) |
| `stop_workflow` | `{ data: { workflowId: string } }` | Stop specific workflow |
| `register_trigger` | `{ workspaceId, trigger, workspaceData?, baseWorkflowsPath? }` | Register scheduled/webhook/Telegram/manual trigger |
| `unregister_trigger` | `{ workspaceId }` | Remove all triggers for workspace |
| `user_prompt_response` | `{ promptId: string, response: string }` | Respond to user prompt |
| `console_input` | `{ promptId: string, message: string }` | Respond to console input prompt |
| `get_pending_prompts` | `{}` | List unresolved prompts |

### Server → Client Messages

| Message Type | Payload | Description |
|--------------|---------|-------------|
| `pong` | `{ timestamp }` | Heartbeat response |
| `connected` | `{ message, timestamp }` | Connection confirmed |
| `message` | `{ data: ConsoleEvent, timestamp? }` | Console output (system, info, success, error, warn) |
| `workspace_aborted` | `{ message, timestamp }` | Workspace abort acknowledged |
| `workspace_stopped` | `{ requestId?, data: { id, message, timestamp }, timestamp? }` | Terminal workspace execution stop signal |
| `workspace_artifacts` | `{ requestId?, data: { workspace, workspaceId, artifacts }, timestamp }` | Download & inspection capability URLs for generated artifacts |
| `workflow_result` | `{ id, data, timestamp }` | Workflow execution result |
| `workflow_stopped` | `{ workflowId, timestamp }` | Workflow stop acknowledged |
| `trigger_registered` | `{ success, workspaceId, trigger, data?, message?, timestamp }` | Trigger registration result |
| `trigger_unregistered` | `{ success, workspaceId, timestamp }` | Trigger unregistration result |
| `user_prompt_acknowledged` | `{ promptId, success, timestamp }` | User prompt response acknowledged |
| `user_prompt_resolved` | `{ promptId, response, timestamp }` | Broadcast when prompt resolved |
| `console_input_resolved` | `{ data: { promptId, message, timestamp }, timestamp }` | Broadcast when console input resolved |
| `pending_prompts` | `{ data: ConsoleEvent[], timestamp }` | List of unresolved prompts |
| `execute_command` | `{ commandId, command, data, timestamp }` | Broadcast command to all clients |
| `error` | `{ requestId?, commandType, code, message, timestamp }` | Error response (e.g. WORKSPACE_FAILED, VALIDATION_ERROR) |

### Error Codes
- `VALIDATION_ERROR` — Invalid payload format or missing required fields
- `EXECUTION_ERROR` — Runtime error during task/node execution
- `WORKSPACE_FAILED` — Terminal failure when all workspace tasks failed or were blocked
- `TIMEOUT` — Operation timed out
- `NOT_FOUND` — Resource not found
- `INTERNAL_ERROR` — Unexpected server error

---

## Frontend Message Interpretation & UI Integration Guide

This guide describes how connected frontend applications (such as yaLLMa3 Studio, CLI, or web dashboards) must interpret incoming WebSocket messages to render logs, show execution progress, prompt users, and download output artifacts.

### 1. State Machine

```
              ┌───────────────┐
              │ Disconnected  │
              └───────┬───────┘
                      │ connect()
                      ▼
              ┌───────────────┐
              │   Connected   │◄───────────────┐
              └───────┬───────┘                │
                      │ send "run_workspace"   │
                      ▼                        │
              ┌───────────────┐                │
              │   Executing   │                │
              └───────┬───────┘                │
                      │                        │
       ┌──────────────┴──────────────┐         │
       ▼                             ▼         │
┌──────────────┐              ┌──────────────┐ │
│  Streaming   │              │ User Prompt  │ │
│  Log Events  │              │ / Input Wait │ │
└──────┬───────┘              └──────┬───────┘ │
       │                             │         │
       │                             ▼         │
       │                      ┌──────────────┐ │
       │                      │  user_prompt │ │
       │                      │  _response   │ │
       │                      └──────┬───────┘ │
       │                             │         │
       └──────────────┬──────────────┘         │
                      │                        │
                      ▼                        │
          ┌───────────────────────┐            │
          │ Terminal State Signal │────────────┘
          │ (Success / Failed /   │ (returns to Connected/Idle)
          │  Stopped / Artifacts) │
          └───────────────────────┘
```

### 2. Message Dispatching Rules

When `ws.onmessage` receives a JSON payload `msg`, inspect `msg.type`:

| `msg.type` | Severity / Meaning | Recommended Frontend Action |
|---|---|---|
| `connected` | Info | Set connection status badge to green. Store instance ID if provided. |
| `pong` | Heartbeat | Reset keepalive watchdog timer. |
| `message` | Streamed Event | Inspect `msg.data.type`:<br>• `"system"`: Render muted system log line or startup banner.<br>• `"info"`: Render neutral console log line (e.g. `[Step 1] [task] ...`).<br>• `"success"`: Render green success pill or task completion log (parse `msg.data.results` for task output JSON).<br>• `"warn"`: Render amber warning notification (e.g. `WORKSPACE_PARTIAL_SUCCESS`).<br>• `"error"`: Render red error log entry with failure reason. |
| `error` | Terminal / Runtime Error | Inspect `msg.code`:<br>• `WORKSPACE_FAILED`: All tasks failed. Mark workspace run as **Failed**, stop running spinner, show error banner with `msg.message`.<br>• `VALIDATION_ERROR`: Schema rejected. Display form validation highlight.<br>• `EXECUTION_ERROR`: Single task error. Keep running if subsequent tasks continue, or wait for terminal stop. |
| `workspace_stopped` | Execution Halted | Stop execution timer, enable "Run Workspace" button, set status to Idle. |
| `workspace_artifacts` | Artifacts Available | Extract `msg.data.artifacts`: render clickable "Download Text Report (`.txt`)" and "Download JSON Blueprint (`.json`)" buttons using provided `downloadUrl` and `viewUrl`. |
| `pending_prompts` | Prompt List | Display active input modal if array is non-empty. |
| `user_prompt_resolved` | Prompt Complete | Dismiss active user prompt modal. |
| `console_input_resolved`| Input Complete | Clear console input bar. |
| `workspace_aborted` | Aborted by User | Mark execution as Cancelled. |

### 3. TypeScript Interfaces for Frontend Clients

```typescript
export type ServerMessage =
  | ConnectedMessage
  | PongMessage
  | ConsoleMessage
  | ErrorMessage
  | WorkspaceStoppedMessage
  | WorkspaceArtifactsMessage
  | PendingPromptsMessage;

export interface ConsoleEvent {
  id: string;
  timestamp: number;
  type: "system" | "info" | "success" | "error" | "warn";
  message: string;
  results?: string; // Stringified JSON output or task results map
}

export interface ConsoleMessage {
  type: "message";
  requestId?: string;
  commandType?: string;
  data: ConsoleEvent;
  timestamp?: string;
}

export interface ErrorMessage {
  type: "error";
  requestId?: string;
  commandType: string;
  code: "WORKSPACE_FAILED" | "VALIDATION_ERROR" | "EXECUTION_ERROR" | "TIMEOUT" | "NOT_FOUND" | "INTERNAL_ERROR";
  message: string;
  timestamp: string;
}

export interface WorkspaceArtifact {
  filename: string;
  format: "text" | "json";
  downloadUrl: string; // e.g. /output/download/Workspace_timestamp.json?token=uuid
  viewUrl: string;     // e.g. /output/view/Workspace_timestamp.json?token=uuid
}

export interface WorkspaceArtifactsMessage {
  type: "workspace_artifacts";
  requestId?: string;
  data: {
    workspace: string;
    workspaceId: string;
    artifacts: WorkspaceArtifact[];
  };
  timestamp: string;
}

export interface WorkspaceStoppedMessage {
  type: "workspace_stopped";
  requestId?: string;
  data: {
    id: string;
    timestamp: number;
    message: string;
  };
}
```

### 4. Downloading Output Artifacts

When `workspace_artifacts` arrives:
```typescript
function onWorkspaceArtifacts(msg: WorkspaceArtifactsMessage, serverBaseUrl: string) {
  for (const artifact of msg.data.artifacts) {
    const fullDownloadUrl = `${serverBaseUrl}${artifact.downloadUrl}`;
    const fullViewUrl = `${serverBaseUrl}${artifact.viewUrl}`;

    if (artifact.format === "json") {
      // JSON Sidecar: Contains full blueprint, diagnostics, and steps
      renderDownloadButton("JSON Sidecar", fullDownloadUrl);
    } else if (artifact.format === "text") {
      // Text Summary Report
      renderDownloadButton("Execution Report (.txt)", fullDownloadUrl);
    }
  }
}
```
*Note*: The `downloadUrl` and `viewUrl` already contain one-time cryptographically signed capability tokens (`?token=...`). The frontend does NOT need to supply authorization headers when downloading these files.

### Trigger Execution Contract
Scheduled, webhook, and Telegram executions use `TriggerExecutionContext` (implements `ExecutionContext` interface) which intercepts `run_workflow` calls and executes via `ExecutionOrchestrator`. Results are broadcast to all connected clients via `ExecutionContext.broadcast()`.

### ExecutionContext Pattern
Both real WebSocket connections (`WebSocketContext`) and trigger executions (`TriggerExecutionContext`) implement the `ExecutionContext` interface:
```typescript
interface ExecutionContext {
  send(message: unknown): void;
  onMessage(handler: (data: unknown) => void): void;
  onClose(handler: () => void): void;
  broadcast(message: unknown): void;
}
```

This replaces the previous mock WebSocket object pattern.

## Dependencies
- **Consumes**: `createMainAgent()` (`Utils/Runtime.ts`), `ExecutionOrchestrator` (`Execution/Orchestrator.ts`), trigger manager singletons, `ExecutionContext` implementations
- **Consumed by**: `index.ts` (setup), frontend clients (yallma3-cli, studio)

## See Also
- [Entry Point](system_entry.md) — server startup
- [Agent System](system_agent.md) — agent execution
- [Workflow Engine](system_workflow.md) — workflow execution
- [Trigger System](system_triggers.md) — trigger managers
- [Execution Context](system.md#key-architectural-patterns) — ExecutionContext pattern