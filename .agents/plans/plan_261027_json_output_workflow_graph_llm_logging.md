---
purpose: "Implement machine-readable JSON output containing clean workflow graph, LLM interactions, and execution steps when YALLMA3_OUTPUT_JSON=true"
agent: "Antigravity"
llm: "Gemini 3.8 Flash"
date: "261027"
design_option_ref: ".agents/design-options/design-options_261027_json_output_workflow_graph_llm_logging.md"
---

# Plan: Machine-Readable JSON Output with Workflow Graph, LLM Interactions, and Step Logs

## Context
- **Related specs**:
  - [.agents/specs/product_output_json.md](.agents/specs/product_output_json.md)
  - [.agents/specs/system_agent.md](.agents/specs/system_agent.md)
  - [.agents/specs/system_workflow.md](.agents/specs/system_workflow.md)
- **Design decision**: Selected Option B in [.agents/design-options/design-options_261027_json_output_workflow_graph_llm_logging.md](.agents/design-options/design-options_261027_json_output_workflow_graph_llm_logging.md)
- **Scope**:
  - IN SCOPE: Dedicated `ExecutionTracer` module, workflow graph sanitization, LLM interaction wrapping and logging, task and workflow node step recording, `MainAgentV1` JSON sidecar persistence, unit and integration tests.
  - OUT OF SCOPE: Modifying WebSocket message schemas sent to the frontend GUI, changing text output format in `Output/*.txt`.

## Acceptance Criteria
- [ ] Setting `YALLMA3_OUTPUT_JSON="true"` or `"1"` generates an enriched structured JSON sidecar under `Output/`.
- [ ] The `workflows` array in the JSON output contains clean, machine-readable workflow graphs:
  - Nodes include `id`, `type`, `title`, `category`, clean `config` key-value pairs, `inputs`, and `outputs`.
  - UI visual clutter is completely eliminated (no `x, y, width, height, selected, processing`, nor i18n parameter maps).
  - Connections/edges contain semantic endpoints (`fromNodeId, toNodeId, fromSocket, toSocket, fromSocketTitle, toSocketTitle`).
- [ ] The `llmInteractions` array captures every LLM call made during execution with caller context, provider, model, prompt/messages, response, tool calls, and durationMs.
- [ ] The `steps` array captures chronological execution steps (tasks, agent iterations, and workflow node executions with inputs, outputs, status, and duration).
- [ ] All existing test suites pass with zero regressions.

## Phases

### Phase 1: ExecutionTracer and Graph Sanitizer Primitives
- **Goal**: Create `Execution/ExecutionTracer.ts` containing pure graph sanitization, step collection, and non-invasive LLM provider proxying.
- **Tasks**:
  - [ ] Implement `sanitizeWorkflowGraph(workflow: Workflow)` to extract clean, uncluttered graph structures and resolve edge socket titles and node IDs.
  - [ ] Implement `ExecutionTracer` class with methods `recordWorkflow`, `recordStep`, `recordLLMInteraction`, `wrapLLM`, `recordLog`, and `buildPayload`.
  - [ ] Write comprehensive unit tests in `tests/unit/execution/ExecutionTracer.test.ts`.
- **Verification**: `npx vitest run tests/unit/execution/ExecutionTracer.test.ts` passes.
- **Spec updates**: `system_agent.md`

### Phase 2: MainAgent & AgentRuntime Integration
- **Goal**: Integrate `ExecutionTracer` into `MainAgentV1` and `AgentRuntime` / `Yallma3GenOneAgentRuntime`.
- **Tasks**:
  - [ ] Instantiate `ExecutionTracer` in `MainAgentV1`.
  - [ ] Wrap `MainLLM` calls (`analyzeTaskCore`, `planAgenticTask`, `assignBestFit`) with caller context.
  - [ ] Pass `ExecutionTracer` (or wrapped LLM) into `runAgent` / `Yallma3GenOneAgentRuntime` to capture reasoning, review, and final-check iterations.
  - [ ] Capture task execution start, completion, status, and duration in `tracer.recordStep`.
  - [ ] Update `MainAgentV1.saveResults()` to populate the sidecar with the tracer's clean workflows, steps, and LLM interactions when `YALLMA3_OUTPUT_JSON` is enabled.
- **Verification**: `npx vitest run tests/unit/agent/MainAgentV1.test.ts` passes.
- **Spec updates**: `system_agent.md`

### Phase 3: Workflow Runtime Integration
- **Goal**: Connect `ExecutionTracer` into workflow execution so executed workflows and node-level steps are captured.
- **Tasks**:
  - [ ] Record the executed workflow graph in `ExecutionTracer`.
  - [ ] Thread `ExecutionTracer` into `executeWorkflowTask` / `executeFlowRuntime` (via `NodeExecutionContext` or optional param) to record node-level execution steps (node id, title, type, inputs, output, status, duration).
  - [ ] Wrap workflow node LLMs (Chat nodes) so node LLM interactions are captured in `llmInteractions`.
- **Verification**: `npx vitest run tests/integration/workflows/goal2Execution.test.ts` and `tests/integration/workflows/runtime.test.ts` pass.
- **Spec updates**: `system_workflow.md`

### Phase 4: Integration Verification and Documentation
- **Goal**: Full verification across all test suites, adding dedicated sidecar verification tests, and updating documentation.
- **Tasks**:
  - [ ] Add integration test verifying the full JSON sidecar output for a workspace containing both agent tasks and workflow tasks.
  - [ ] Run complete test suite (`npx vitest run`).
  - [ ] Update `system_agent.md`, `system_workflow.md`, `spec-index.json`.
  - [ ] Write status report in `.agents/status/status_261027_json_output_workflow_graph_llm_logging.md`.
- **Verification**: All 27+ test files pass cleanly with zero errors.

## Risks & Mitigations
- *Risk*: Circular references or non-serializable objects in node outputs or LLM tool arguments causing `JSON.stringify` to throw.
  *Mitigation*: Implement safe serialization with fallback handling (e.g. using `Helper.JsonParser` or safe stringify with depth limiting).
- *Risk*: LLM provider wrapping breaking mock providers in existing tests.
  *Mitigation*: Use ES6 `Proxy` in `wrapLLM` to transparently delegate all methods, getters, and setters to the underlying provider instance.
