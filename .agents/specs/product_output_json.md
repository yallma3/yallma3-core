# BRD: Machine-Readable JSON Output with Workflow Graph, LLM Interactions, and Step Logs (Date: 261027)
- **Reference**: `YALLMA3_OUTPUT_JSON` structured output enhancement
- **Related BRDs**: [product.md](product.md)

## Business Context
- **Problem statement**: When `YALLMA3_OUTPUT_JSON` is enabled, yaLLMa3 generates a JSON sidecar file. Currently, this file only includes basic metadata, top-level task statuses, and workflow `{ id, name }` stubs. It lacks the executable workflow graph definition, detailed node-by-node execution steps, and LLM prompt/response interactions. Downstream AI agents and automated evaluation tools cannot reconstruct the executed workflow graph or analyze and improve upon the prompt chains and agent decisions.
- **Stakeholder**: AI Agent developers, LLM engineers, automated evaluation pipelines, yaLLMa3 core team.
- **Desired outcome**: A clean, machine-readable JSON sidecar containing:
  1. The executable workflow graph(s) being executed (nodes, configuration parameters, and typed socket connections) stripped of UI-specific clutter (coordinates, visual flags, i18n maps).
  2. Granular step logging capturing task execution, workflow node execution (inputs, outputs, execution status, timings), and agent reasoning/review loops.
  3. Complete LLM interactions log (caller identity, model, provider, prompts, tool calls, responses, and latency).
  4. Zero redundant or cluttered payload bloat to ensure high parsing efficiency and immediate agent comprehensibility.
- **Priority**: P1 - High
- **Target date**: 2026-10-27

## Personas
- **Primary personas**:
  - *Autonomous AI Agent / Optimizer*: Ingests the JSON output to analyze node failures, critique prompts, refine workflow topology, or auto-tune parameter values.
  - *AI Engineer / Debugger*: Inspects the sidecar to audit exact LLM conversations, token usage, tool invocations, and topological execution order.
- **Secondary personas**:
  - *End User / Operator*: Runs workspaces via CLI/API and reviews structured execution results.

## Use Cases

### UC-01: Workflow Graph Inspection and AI Enhancement
- **Description**: An AI Agent reads the JSON output to examine the exact graph of nodes and connections that was executed, identifying bottlenecks or prompt weaknesses and proposing graph modifications.
- **Trigger**: Workspace execution completes with `YALLMA3_OUTPUT_JSON=true` or `1`.
- **Preconditions**: Workspace containing one or more workflows is executed.
- **Postconditions**: The JSON file contains clean `workflows` entries featuring nodes (id, type, title, category, clean config parameters, input/output sockets) and semantic connections (fromNodeId, toNodeId, fromSocket, toSocket, socket titles).
- **Frequency**: Every executed workspace run where JSON output is enabled.
- **Complexity**: Medium
- **Criticality**: Critical
- **Main flow**:
  1. Engine executes workspace tasks and hydrated workflow graphs.
  2. On completion, engine serializes the executed workflow graph into clean schema.
  3. Engine strips UI rendering coordinates (`x, y, width, height`), selection flags, and internal closures.
  4. Engine persists the graph in the JSON sidecar under `workflows`.

### UC-02: LLM Interaction Auditing & Prompt Enhancement
- **Description**: An AI Agent or engineer reviews all LLM interactions that took place during task interpretation, agent reasoning loops, review phases, and workflow chat/node executions.
- **Trigger**: An LLM call is issued by MainAgent, AgentRuntime, or Workflow Nodes.
- **Preconditions**: Execution is tracked by the execution tracer.
- **Postconditions**: Each LLM interaction is captured with caller context, provider, model, prompt/messages, response, tool calls, and duration.
- **Frequency**: Multiple calls per workspace execution.
- **Complexity**: Medium
- **Criticality**: Critical
- **Main flow**:
  1. Component executes LLM invocation via provider.
  2. Interaction recorder captures input messages, model settings, and timing.
  3. LLM provider generates completion or executes tool calls.
  4. Interaction recorder captures final response and tool execution details.
  5. Interactions are saved under `llmInteractions` in the JSON sidecar.

### UC-03: Execution Step Logging & Trajectory Analysis
- **Description**: Detailed execution steps are preserved so that each phase of the run can be evaluated sequentially.
- **Trigger**: Tasks, agent iterations, and workflow nodes begin, execute, skip, or fail.
- **Preconditions**: Engine runs tasks.
- **Postconditions**: `steps` list contains chronologically ordered execution step records with inputs, outputs, status, and duration.
- **Frequency**: Every task/node execution.
- **Complexity**: Low
- **Criticality**: Important

### UC-04: Verbose Stdio Output of Received Graph
- **Description**: When `YALLMA3_OUTPUT_JSON` is enabled, the runtime outputs verbose logging to stdio, printing the exact clean graph definition immediately once received for execution.
- **Trigger**: Workspace or workflow is received by `MainAgentV1` or `executeFlowRuntime`.
- **Preconditions**: `YALLMA3_OUTPUT_JSON` is `"true"` or `"1"`.
- **Postconditions**: The clean, machine-readable graph structure (nodes, config, sockets, connections) is printed to stdout / console.
- **Frequency**: At the beginning of each execution run.
- **Complexity**: Low
- **Criticality**: Important

### UC-05: Secure Client Output Artifact Retrieval & Download
- **Description**: Web clients, AI agents, and Studio frontends download or inspect generated execution artifacts (`.json` and `.txt`) securely via HTTP streaming with configurable token expiration.
- **Trigger**: Workspace execution finishes and saves artifacts in `./Output/`.
- **Preconditions**: Client is connected to WebSocket and receives `workspace_artifacts` event with ephemeral capability tokens.
- **Postconditions**: Client can trigger native browser file download via `GET /output/download/:filename?token=<uuid>` or inline viewing via `GET /output/view/:filename?token=<uuid>`.
- **Configuration Hierarchy**:
  1. CLI startup flag (`--output-token-ttl=<duration>`)
  2. Environment variable (`YALLMA3_OUTPUT_TOKEN_TTL`, default `10m`)
  3. Default fallback: 10 minutes (clamped between 5 seconds and 7 days).
- **Frequency**: On demand per completed workspace run.
- **Complexity**: Low
- **Criticality**: Critical
- **Main flow**:
  1. `MainAgentV1.saveResults()` saves files and issues ephemeral capability tokens via `OutputTokenManager` using configured TTL.
  2. Server emits `workspace_artifacts` WebSocket event containing token-gated download and view URLs.
  3. Client fetches file using capability token.
  4. Server validates token, enforces path confinement within `./Output/`, and streams file with appropriate headers (`Content-Disposition: attachment` or inline MIME types).

### UC-06: Truthful Workspace Execution Status & Diagnostic Summary in Structured Output
- **Description**: The generated JSON sidecar and accompanying text output must truthfully represent the overall workspace execution status, task failure reasons, and execution summary metrics. The engine must never emit a false "Workspace completed successfully" event when tasks fail or are blocked.
- **Trigger**: `MainAgentV1.finalize()` and `saveResults()` are invoked upon completion of task execution.
- **Preconditions**: Task execution loop completes or is aborted.
- **Postconditions**:
  1. Root `status` is set to one of `"completed"`, `"failed"`, `"partial_success"`, or `"aborted"`.
  2. Trailing `exitStatus` categorizes the execution termination state: `"success"`, `"aborted"`, `"blocked"`, or `"validation_error"` (repurposing the legacy `aborted: boolean`).
  3. Root `statusReason` provides a concise human-readable summary (e.g. `"Workspace execution failed: 1 task failed, 1 blocked"`).
  4. Root `summary` object contains counts: `totalTasks`, `succeededTasks`, `failedTasks`, `blockedTasks`.
  5. Each record in `tasks[]` includes `status` (`success` | `failed` | `blocked`), `reason` (diagnostic string or null), and `durationMs`.
  6. `finalResult` is `null` if the final task failed or was blocked (never masked as `"{}"`).
  7. The terminal log in `logs[]` and the terminal WebSocket event match the actual status:
     - `failed` emits `level: "error"` with `code: "WORKSPACE_FAILED"`
     - `partial_success` emits `level: "warn"` with `code: "WORKSPACE_PARTIAL_SUCCESS"`
     - `completed` emits `level: "success"` with `"Workspace completed successfully."`
  8. The `.txt` report displays `[FAILED] <reason>` and `[BLOCKED] <reason>` instead of `undefined` for non-successful tasks.
- **Frequency**: Every executed workspace run where output is generated.
- **Complexity**: Low
- **Criticality**: Critical

### UC-07: Autonomous Agent Problem Detection & Workspace Optimization
- **Description**: The JSON output serves as an end-to-end specimen for downstream autonomous optimization agents to detect problems, critique prompts, and suggest concrete workspace enhancements. To achieve this, the JSON must bundle the full declarative workspace blueprint (task graph, agent definitions with prompts/background, workflow graphs) alongside runtime telemetry and first-class root-cause diagnostics.
- **Trigger**: An autonomous agent, developer, or evaluation pipeline ingests the generated JSON output file.
- **Preconditions**: Workspace completes execution and saves the JSON sidecar.
- **Postconditions**:
  1. **Full Task Blueprint**: Every task entry includes its declarative definition (`title`, `type`, `role`, `description`, `systemPrompt`, `expectedOutput`, `executorId`) alongside execution results (`status`, `reason`, `durationMs`, `result`).
  2. **Task Graph Topology**: Root `taskConnections` preserves the dependency DAG (`fromTask`, `toTask`), enabling optimization agents to analyze and suggest graph rewirings.
  3. **Complete Agent Blueprint**: Agent entries include `name`, `role`, `background`, `systemPrompt`, `llm`, and `tools`, enabling prompt engineering agents to critique and optimize agent prompts.
  4. **First-Class Diagnostics Block (`diagnostics`)**:
     - `hasFailures`: boolean indicating whether any task or node failed.
     - `rootCauses[]`: array attributing failures to specific components (`source`, `taskId`, `workflowId`, `nodeId`, `errorCategory`, `message`, `input`).
     - `impactedTasks[]`: list of tasks blocked or skipped due to cascading dependencies.
- **Frequency**: Every executed workspace run where output is generated.
- **Complexity**: Medium
- **Criticality**: Critical
- **Main flow**:
  1. Engine aggregates declarative workspace data (tasks, connections, agents, workflows) and execution telemetry (steps, llm interactions, logs).
  2. Engine inspects `taskStatuses` and `ExecutionTracer` steps to synthesize the `diagnostics` block.
  3. Engine serializes the unified specimen to `Output/<workspaceName>_<timestamp>.json`.
  4. Optimization agent ingests the file, evaluates diagnostics and blueprint, and outputs workspace enhancement suggestions.

## Volumetrics
- **Expected users**: Internal developers, autonomous AI agents, CI evaluation pipelines.
- **Transactions per day**: 500–5,000 runs/day.
- **Data per operation**: ~20 KB to 500 KB per JSON sidecar (clean, non-redundant).
- **Retention period**: Managed by workspace file retention policies or external artifact storage.

## Dependencies
- **Internal dependencies**: `MainAgentV1`, `Workflow/runtime.ts`, `Agent/Agent.ts`, `Execution/ExecutionContext.ts`.
- **External dependencies**: File system (`fs/promises`).

## Acceptance Criteria
- [ ] Setting `YALLMA3_OUTPUT_JSON=true` or `1` produces a valid JSON file alongside the text output.
- [ ] The JSON output includes a clean, machine-readable `workflows` graph with `nodes` and `connections` (without UI clutter like `x, y, width, height, selected, processing`, or i18n strings).
- [ ] The JSON output includes an `llmInteractions` array capturing caller identity, provider, model, prompt/messages, response, and duration.
- [ ] The JSON output includes a `steps` array capturing task and workflow node execution steps with statuses, inputs, outputs, and timings.
- [ ] The JSON output includes top-level `status` (`completed`, `failed`, `partial_success`, `aborted`), `statusReason`, and `summary` metrics (`totalTasks`, `succeededTasks`, `failedTasks`, `blockedTasks`).
- [ ] The JSON output includes trailing `exitStatus` (`success`, `aborted`, `blocked`, `validation_error`), accurately capturing runner exit state and replacing legacy boolean `aborted`.
- [ ] Each task entry in `tasks[]` records its execution `status`, `reason`, and `durationMs`.
- [ ] The JSON output includes the complete declarative workspace blueprint: task definitions (descriptions, prompts, expected outputs), task dependency topology (`taskConnections`), and agent definitions (background, system prompt, tools).
- [ ] The JSON output includes a structured `diagnostics` section attributing failures to root causes (component, node, error category, message, inputs) and listing impacted tasks, enabling autonomous agents to diagnose issues and recommend workspace improvements.
- [ ] The runtime never emits a false "Workspace completed successfully" success event when tasks have failed or been blocked.
- [ ] The JSON schema is concise, well-structured, and contains no duplicate or redundant payload data.
