# Design Options: Machine-Readable JSON Output (Workflow Graph, LLM Interactions, and Step Logs) (Date: 261027)

## Problem Statement
When `YALLMA3_OUTPUT_JSON` is enabled (`"true"` or `"1"`), yaLLMa3 currently writes a JSON sidecar file (`Output/<workspace>_<timestamp>.json`). However, this file only contains basic metadata, task results, and workflow ID/name pairs (`{ id, name }`). Downstream AI agents cannot:
1. Access or reconstruct the executable workflow graph (nodes, configurations, socket connections) that was executed.
2. Inspect granular execution steps (node-level statuses, inputs, outputs, agent reasoning steps).
3. Audit or enhance LLM interactions (prompts, tool calls, completions, latencies, model identity).

The goal is to provide a clean, machine-readable JSON structure without clutter (no UI coordinates, selection flags, i18n maps, or circular closures) and without redundant duplication.

## Baseline Analysis
- **Current JSON generation**: Located in [`Agent/Main/Versions/MainAgentV1.ts:500-536`](file:///home/assem/work/yaLLMa3/yallma3-core/Agent/Main/Versions/MainAgentV1.ts#L500-L536).
- **Workflows**: `this.workspaceData.workflows.map((w) => ({ id: w.id, name: w.name }))` drops all nodes and connections.
- **Workflow Execution**: [`Agent/Utls/ToolCallingHelper.ts:40-45`](file:///home/assem/work/yaLLMa3/yallma3-core/Agent/Utls/ToolCallingHelper.ts#L40-L45) unwraps only `finalResult`, discarding the node-level results map returned by `executeFlowRuntime`.
- **LLM Invocations**: LLM providers implement `generateText(prompt)` and optional `callLLM(messages)` in [`LLM/LLMProvider.ts`](file:///home/assem/work/yaLLMa3/yallma3-core/LLM/LLMProvider.ts). Currently no audit trail or prompt transcript is retained for sidecar output.

## Design Parameters
1. **Machine Readability & Agent Utility**: Can an AI agent directly understand the workflow graph topology, parameters, inputs, outputs, and LLM conversations to generate enhancements?
2. **Conciseness & Clutter Elimination**: Are UI coordinates (`x, y, width, height`), editor flags (`selected, processing`), and bloated UI metadata (`i18n, acceptedFileTypes, UIConfigurable`) eliminated?
3. **Non-Invasive Architecture**: Does tracking require altering existing LLM provider implementations or breaking existing tests?
4. **Modularity & Testability**: Can graph sanitization, step tracing, and LLM interaction recording be tested in pure isolation?

---

## Options Evaluated

### Option A: Ad-Hoc In-Place Array Accumulation
- **Approach**: Add local tracking arrays (`llmCalls[]`, `steps[]`, `workflowGraphs[]`) directly inside `MainAgentV1.ts` and pass mutable arrays into `workflowExecutor`, `executeFlowRuntime`, and `Yallma3GenOneAgentRuntime`.
- **Pros**:
  - Requires no new abstraction classes.
- **Cons**:
  - High coupling across `MainAgentV1`, `ToolCallingHelper`, `Workflow/runtime`, and `AgentRuntime`.
  - Violates single responsibility principle.
  - Hard to test serialization and tracing logic independently.
  - Fragile if another caller executes a workflow or agent outside `MainAgentV1`.
- **Fit**: Poor.

### Option B: Dedicated `ExecutionTracer` & Clean Graph Sanitizer (Recommended)
- **Approach**:
  1. Create `Execution/ExecutionTracer.ts` encapsulating:
     - `sanitizeWorkflowGraph(workflow: Workflow)`: Transforms hydrated/wire workflow nodes and connections into a clean, machine-readable schema:
       - Node: `{ id, type, title, category, config: Record<string, any>, nodeValue?, inputs: [{ id, name, dataType }], outputs: [{ id, name, dataType }] }`.
       - Connection: `{ fromNodeId, fromSocket, fromSocketTitle, toNodeId, toSocket, toSocketTitle }`.
     - `recordStep(...)`: Records task, workflow node, and agent iteration execution steps with status, duration, inputs, and outputs.
     - `recordLLMInteraction(...)` & `wrapLLM(provider, callerInfo)`: Transparent proxy/wrapper around `LLMProvider` that intercepts `generateText` and `callLLM`, recording prompt, response, tool calls, model, provider, and duration without modifying any provider code.
     - `recordLog(...)`: Records formatted log events.
  2. MainAgentV1 instantiates `ExecutionTracer` when running.
  3. Wire tracer into `MainAgentV1`'s tasks, `executeWorkflowTask` (capturing node execution steps and outputs), and `runAgent` (wrapping the agent LLM provider and recording iteration steps).
  4. At `saveResults()`, merge the tracer's clean graph, steps, and LLM interactions into the sidecar payload when `YALLMA3_OUTPUT_JSON` is enabled.
- **Pros**:
  - Completely non-invasive: preserves `LLMProvider` interface and all provider implementations.
  - Zero UI clutter: extracts only semantic graph data, connection semantics, and clean key-value parameters.
  - Fully testable in unit tests: `ExecutionTracer` and `sanitizeWorkflowGraph` can be tested with unit fixtures.
  - Extensible to standalone workflow runs or future execution runners.
- **Cons**:
  - Requires adding `tracer` threading into execution helper functions where steps are executed.
- **Fit**: Excellent.

### Option C: WebSocket Message Sniffing & Event Bus Interception
- **Approach**: Attach an internal listener to `ExecutionContext.send()` and `ExecutionContext.broadcast()` to reconstruct execution state from WebSocket events.
- **Pros**:
  - No changes to function signatures in execution runtime.
- **Cons**:
  - WebSocket messages currently omit full LLM prompts and raw responses to save bandwidth and prevent leaking internal secrets.
  - Emitting full LLM prompts/completions over WebSocket would significantly bloat client network usage.
  - Workflow graph definitions are not broadcast over WebSocket during execution.
- **Fit**: Poor.

---

## Decision
Adopt **Option B: Dedicated ExecutionTracer & Clean Graph Sanitizer**. It produces clean, machine-readable graphs and interaction logs without modifying LLM providers or cluttering WebSocket traffic.

## Selected Option

- **Option**: Option B — Dedicated ExecutionTracer & Clean Graph Sanitizer
- **Selected By**: Antigravity (Gemini 3.8 Flash)
- **Timestamp**: 2026-10-27T15:16:45+03:00
- **User**: assem
- **Rationale**: Option B achieves complete observability of workflow graph topology, granular step execution (node inputs/outputs), and verbatim LLM conversations without adding UI clutter or modifying existing LLM providers.
- **Reference**: [.agents/design-options/design-options_261027_json_output_workflow_graph_llm_logging.md](design-options_261027_json_output_workflow_graph_llm_logging.md)
- **Spec Update Plan**:
  - `system_agent.md`: Document `ExecutionTracer` integration in `MainAgentV1` and structured JSON sidecar schema.
  - `system_workflow.md`: Document graph sanitization and node execution step recording.
  - `spec-index.json`: Add index entry for structured JSON output enhancement.
