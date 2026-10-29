# Workflow Engine (`Workflow/`)

## Purpose
Self-registering node-based workflow execution engine. Manages 30+ node types across categories (Chat, MCP, Utility, Data, Input/Output, Search, Other, Workflow). Builds connection-based execution DAGs and executes nodes in dependency order.

> **ADR**: [research_260619_workflow-output-node.md](../research/research_260619_workflow-output-node.md)

## Internal Contracts

### NodeRegistry
```typescript
type NodeFactory = (id: number, position: { x: number; y: number }) => BaseNode;

class NodeRegistry {
  registerNodeType(name: string, factory: NodeFactory, metadata: NodeMetadata): void;
  createNode(name: string, id: number, position: { x: number; y: number }): BaseNode | undefined;
  getFactory(nodeType: string): NodeFactory | undefined;
  listNodeTypes(): string[];
  listCategories(): string[];
  getAllNodeDetails(): { categories: string[]; nodes: NodeMetadata[] };
}

const nodeRegistry: NodeRegistry;  // Singleton
```

### executeFlowRuntime
```typescript
function executeFlowRuntime(
  workflow: Workflow,
  ctx: ExecutionContext,
  context?: string,
  triggerData?: unknown,
  broadcast?: (data: unknown) => void,
  tracer?: ExecutionTracer
): Promise<{ layers: number[][]; results: Record<string, unknown>; finalResult: unknown } | Error>
```
- Performs topological sort of nodes
- Executes nodes layer-by-layer
- Supports Loop nodes (`Run Mode = "all"`), Chat Loop nodes (UserPrompt → Chat via `Prompt Loop` / `User Input`)
- Injects the current workspace's `mainLLM` + `workflowId` and optional `tracer` into every `NodeExecutionContext`
- Records node execution steps (status: executed/skipped, inputs, output, durationMs) into `tracer` if provided
- Stoppable via `requestStop(workflowId)`
- Returns (never throws) on error to preserve the caller return-value contract

### Workflow Ingress Normalization (`Workflow/utils/normalizeWorkflow.ts`)
```typescript
function normalizeWorkflowPayload(rawWorkflow: Workflow): Workflow;
function normalizeWorkspacePayload(rawWorkspace: WorkspaceData): WorkspaceData;
```
- Normalizes incoming wire payloads (such as Studio Goal 2 lean payloads) into canonical `Workflow` structures at the WebSocket/API ingress boundary.
- Enriches missing `category` from `nodeRegistry`, sets default coordinates `x: 0, y: 0` when canvas geometry is stripped, and preserves custom titles, `sockets`, and `configParameters`.
- Re-derives sockets from factory templates if omitted.


### Node Execution Context
```typescript
type NodeExecutionContext = {
  node: NodeType;
  inputs: Record<string, unknown>;
  ctx: ExecutionContext;
  triggerData?: unknown;
  mainLLM?: { option: LLMOption; apiKey: string };  // current workspace Main LLM
  workflowId?: string;                              // owning workflow id
};
```
Each node processes via `node.process(context: NodeExecutionContext): Promise<NodeValue | undefined>`.
`mainLLM` / `workflowId` are resolved once per run from the current `WorkspaceRepository` workspace
and threaded into the context so nodes never query ambient singletons themselves.

### Error Handling & Node Failure Contracts

> **Detailed Specification**: [system_261029_error_capture_and_propagation.md](system_261029_error_capture_and_propagation.md)

#### Node-Level Contract
- **Operational & Transport Failures**: Nodes encountering unrecoverable transport failures (e.g., MCP SSE connection drops, socket timeouts, HTTP network errors) or invalid processing conditions MUST throw an `Error`. Nodes MUST NOT catch external connectivity errors and return them as string payloads on standard output sockets (e.g., `{ [socket]: "Error: ..." }`).
- **Clean Failure Boundaries**: Catch blocks within nodes must clean up client handles/resources before re-throwing the `Error` to allow runtime tracking.

#### Workflow Runtime Contract (`executeFlowRuntime`)
- When any node throws an unhandled exception:
  1. The runtime records the failure in `ExecutionTracer` with `status: "failed"`, the node ID, node title, inputs, and error message.
  2. Further node execution in the workflow DAG halts immediately (downstream nodes, including `WorkflowOutputNode`, are NOT executed).
  3. The runtime clears the stop-registry entry and returns the `Error` object (never throwing unhandled rejections).
  4. Broadcasts `{ type: "workflow_error", workflowId, error }` if broadcast callback is provided.

#### Dual-Graph Error Propagation
- **Fatal Main LLM Stop**: When `executeWithFallback` cannot reach either the node LLM or the workspace Main LLM, it throws `FatalMainLLMError`. This halts **both** execution graphs:
  - **Workflow graph**: `executeFlowRuntime` halts DAG execution, broadcasts `{ type: "workflow_error", workflowId, error }`, and returns the `FatalMainLLMError`.
  - **Task graph** (`MainAgentV1`): `ToolCallingHelper.workflowExecutor` detects `FatalMainLLMError` and re-throws it; `MainAgentV1.executeWorkflowTask` catches it, emits a fatal error report, and sets `aborted = true` to abort the entire workspace.
- **Ordinary Workflow Node Error**:
  - **Workflow graph**: Halts only the failing workflow DAG and returns `Error` to the caller.
  - **Task graph** (`MainAgentV1`): `ToolCallingHelper.workflowExecutor` catches `Error` and returns `{ status: "failed", reason: error.message }`. `MainAgentV1` marks the task as `{ status: "failed", reason }`, emits `EXECUTION_ERROR`, and marks downstream dependent tasks as `blocked` (see [Agent System](system_agent.md)).

### Node Metadata
```typescript
interface NodeMetadata {
  category: string;
  title: string;
  nodeType: string;
  nodeValue?: NodeValue;
  description?: string;
  sockets: Array<{ title: string; type: "input" | "output"; dataType: string }>;
  width: number;
  height: number;
  configParameters: ConfigParameterType[];
  i18n?: Record<string, { category?: string; title?: string; description?: string; nodeType?: string }>;
}
```

### Self-Registration
Each node module exports `register(registry: NodeRegistry): void`. Called once at startup by `initFlowSystem.ts`.

## Node Categories (30+ types)
| Category | Nodes |
|----------|-------|
| **Chat** | ChatNode, ClaudeChatNode, GeminiChatNode, GroqChatNode, OpenAIChatNode, OpenRouterChatNode, OllamaChatNode, VisionNode, AudioNode |
| **MCP** | McpDiscoveryNode, McpToolCallNode, McpGetResourceNode, McpGetPromptNode, McpClientNode |
| **Utility** | mathExpressionNode, textTemplateNode, JoinTextNode, HashNode, HttpCallNode, ifElseNode, DelayNode, JSONManipulatorNode, LoopNode |
| **Data** | DownloaderNode, ChunkingNode, EmbeddingNode, VectorSearchNode, VectorStoreNode |
| **Input/Output** | UserPromptNode, ConsoleInput, ImageInputNode, soundInputNode |
| **Workflow** | WorkflowInputNode, WorkflowOutputNode |
| **Search** | SearchNode, ScraperNode, ArxivScraperNode, UrlRefrenceNode |
| **Other** | SendMailNode, DataGenerationNode, publishToHuggingFaceNode |

## File Structure
| File | Role |
|------|------|
| `NodeRegistry.ts` | Singleton registry for node types |
| `runtime.ts` | `executeFlowRuntime()`, `requestStop()`, `FatalMainLLMError` stop handling |
| `initFlowSystem.ts` | Registers all node types at startup |
| `utils/normalizeWorkflow.ts` | Ingress boundary normalization for Goal 2 and minimal payloads |
| `types/types.ts` | `BaseNode`, `Connection`, `Socket`, `NodeExecutionContext`, `NodeMetadata` |

## Dependencies
- **Consumes**: `WebSocket` for real-time progress, `LLMProvider` for Chat nodes
- **Consumed by**: `Websocket/socket.ts`, `Agent/Main/MainAgent.ts`, trigger managers (via mock WS)

## See Also
- [Agent System](system_agent.md) — consumes workflow execution
- [WebSocket Server](system_websocket.md) — triggers workflow runs
- [LLM System](system_llm.md) — Chat node integration
