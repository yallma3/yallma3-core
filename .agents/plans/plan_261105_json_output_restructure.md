---
purpose: "Restructure workspace JSON output into 5 clean namespaces (meta, result, diagnostics, blueprint, telemetry), capture granular LLM token consumption across all providers, and enhance text output with executive summary and timing telemetry"
agent: "Antigravity"
llm: "Gemini 3.8 Flash (High)"
date: "261105"
design_option_ref: ".agents/design-options/design-options_261022_output_enhancement.md"
---

# Plan: JSON Output Restructuring, Token Consumption Tracing & Observability Enhancements

## Context & Scope

yaLLMa3 produces workspace execution output artifacts when runs complete: a primary text file (`Output/<workspace>_<ts>.txt`) and an optional machine-readable JSON sidecar file (`Output/<workspace>_<ts>.json`) gated by `YALLMA3_OUTPUT_JSON=1|true`.

Currently, the JSON sidecar flattens ~20 disparate properties at the root level, mixing declarative definitions (`taskConnections`, `workflows`, `agents`, task descriptions/prompts) with runtime telemetry (`status`, `steps`, `llmInteractions`, `logs`, `diagnostics`), serializing `meta` as an escaped string, and lacking execution timing roll-ups. Furthermore, while upstream LLM APIs return token consumption metrics, the providers in `LLM/LLMProvider.ts` currently drop this usage data, leaving no trace of token consumption in telemetry. Finally, the accompanying `.txt` file prints results sequentially without a top-level status, timing, or token summary header.

Since there are no legacy consumers requiring backward compatibility, we will cleanly transition the JSON sidecar to a v2 schema partitioned into 5 explicit namespaces:
1. `meta`: Run metadata, engine version (`2.0.0`), timestamps, workspace-level duration, and parsed native `customMeta`.
2. `result`: Top-level status (`completed` | `failed` | `partial_success` | `aborted`), `exitStatus`, human-readable `statusReason`, task counts `summary`, and `finalOutput`.
3. `diagnostics`: `hasFailures`, root-cause failure attribution (`rootCauses[]` with source, taskId, nodeId, category, message, remediation), and cascading `impactedTasks[]`.
4. `blueprint`: Pure declarative workspace definitions: `mainLLM`, `agents[]` (prompts, tools, roles), `workflows[]` (sanitized nodes, configurations, typed connections), `tasks[]` (definitions, expected outputs, prompts), and `taskConnections[]` (dependency DAG).
5. `telemetry`: Pure runtime execution data: `taskResults` (keyed by taskId with status, duration, output, reason), chronological `steps[]`, raw `llmInteractions[]` (with per-interaction token usage), `llmUsage` token aggregate roll-up, and `logs[]`.

Additionally:
- Granular token consumption (`promptTokens`, `completionTokens`, `totalTokens`) will be extracted in `LLMProvider.ts` and captured by `ExecutionTracer.ts`.
- The `.txt` report will be enhanced with an executive summary header at the top (status, exitStatus, total duration, task counts, and token counts).
- Payload truncation guardrails will be placed on oversized outputs.

## Problem / Rationale

1. **AI Optimizer & Evaluator Ergonomics**: Autonomous optimization agents need to parse and distinguish between the declarative workspace blueprint (what was designed) and runtime telemetry (what actually occurred). Flattened root keys create ambiguity and parsing overhead.
2. **Double Serialization**: `meta` is currently serialized as an escaped JSON string (`"{\"version\":\"1.0.0\",...}"`) instead of an accessible native object.
3. **Observability Gaps**: Neither the JSON nor the text file provides workspace-level execution duration (`startTime`, `endTime`, `durationMs`) or token consumption tracking.
4. **Token Blindness**: LLM API calls return token counts, but providers drop `json.usage`, preventing users and auditors from tracking token spend per agent, task, or workspace run.
5. **Developer Readability in `.txt`**: Developers inspecting `.txt` files must scroll through all task lines to discover whether the workspace ultimately succeeded or failed.

## Discovery & Code Locations

- **LLM Contracts & Providers**:
  - `Models/LLM.ts` (`LLMResponse`, `TokenUsage`)
  - `LLM/LLMProvider.ts` (`OpenAIProvider`, `DeepSeekProvider`, `GroqProvider`, `OpenRouterProvider`, `ClaudeProvider`, `GeminiProvider`, `OllamaProvider`)
- **Orchestration & Output Writer**:
  - `Agent/Main/Versions/MainAgentV1.ts` (`saveResults()`, `run()`, `finalize()`, `buildDiagnostics()`)
- **Execution Telemetry & Graph Sanitization**:
  - `Execution/ExecutionTracer.ts` (`ExecutionTracer`, `wrapLLM`, `sanitizeWorkflowGraph`, `safeSanitizeValue`, interfaces)
- **TypeScript Models**:
  - `Models/Workspace.ts` (Workspace interfaces and data models)
  - `Models/WorkspaceOutput.ts` (New file for strongly-typed output contracts)
- **Specifications & Documentation**:
  - `.agents/specs/product_output_json.md`
  - `.agents/specs/system_agent.md`
  - `.agents/specs/spec-index.json`
- **Tests**:
  - `tests/integration/output/JsonSidecarOutput.test.ts`
  - `tests/unit/execution/ExecutionTracer.test.ts`
  - `tests/integration/routes/output.route.test.ts`

## Spec Updates Required (Pre-Implementation)

Before modifying production code, the following spec files must be updated to avoid spec drift:
1. `.agents/specs/product_output_json.md`: Document the 5-namespace v2 schema, the `.txt` executive summary header, token consumption tracing (`telemetry.llmUsage` and `llmInteractions[].usage`), and `customMeta` native parsing.
2. `.agents/specs/system_agent.md`: Update the Structured Output & ExecutionTracer sections to reflect v2 output partitioning and token consumption tracking.
3. `.agents/research/adr_261105_json_output_restructure.md`: Formalize ADR recording the decision, tradeoffs, and rejection of flat schema backward compatibility.
4. `.agents/specs/spec-index.json`: Update spec file entries and timestamps.

---

## Phased Implementation Plan

### Phase 1: Specifications & Architectural Decision (ADR)
- **Gate**: Spec files updated and validated against repo documentation standards.
- **Complexity**: Low
- **Risk**: Low
- **Test Infrastructure Setup**: Markdown linting / inspection.
- **Planned Tests**: Spec drift check against `product_output_json.md` and `system_agent.md`.
- **Steps**:
  1. Update ADR `.agents/research/adr_261105_json_output_restructure.md` recording the v2 namespaced output decision and token consumption tracing.
  2. Update `.agents/specs/product_output_json.md` with the new schema specification, token tracing requirements, `.txt` header design, and acceptance criteria.
  3. Update `.agents/specs/system_agent.md` output documentation.
  4. Update `.agents/specs/spec-index.json`.

### Phase 2: Token Tracking Contracts & Provider Extraction
- **Gate**: `bun x vitest run tests/unit/execution/ExecutionTracer.test.ts`
- **Complexity**: Low
- **Risk**: Low
- **Planned Tests**: Unit tests asserting `TokenUsage` returned by `LLMProvider.callLLM()` and accumulated by `generateText()`.
- **Steps**:
  1. In `Models/LLM.ts`, define:
     ```ts
     export interface TokenUsage {
       promptTokens: number;
       completionTokens: number;
       totalTokens: number;
     }
     ```
     and add optional `usage?: TokenUsage` to `LLMResponse`.
  2. In `LLM/LLMProvider.ts`:
     - In `OpenAIProvider`, `DeepSeekProvider`, `GroqProvider`, `OpenRouterProvider`: extract `usage` from `json.usage` (`prompt_tokens`, `completion_tokens`, `total_tokens`).
     - In `ClaudeProvider`: extract `usage` from `json.usage` (`input_tokens`, `output_tokens`).
     - In `GeminiProvider`: extract `usage` from `json.usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, `totalTokenCount`).
     - In `OllamaProvider`: extract `usage` from `response.prompt_eval_count` and `response.eval_count`.
     - In `generateText()` of each provider, accumulate `usage` across multi-turn tool loops.
  3. Update `ExecutionTracer.wrapLLM()` to intercept `usage` from `callLLM` and `generateText` and attach to `LLMInteraction`.

### Phase 3: TypeScript Data Models & Contract Definitions
- **Gate**: `bun x vitest run tests/unit/execution/ExecutionTracer.test.ts`
- **Complexity**: Low
- **Risk**: Low
- **Planned Tests**: Unit tests verifying serialization of typed contracts.
- **Steps**:
  1. Create `Models/WorkspaceOutput.ts` defining:
     - `WorkspaceOutputV2`
     - `WorkspaceOutputMeta`
     - `WorkspaceOutputResult`
     - `WorkspaceOutputDiagnostics`
     - `WorkspaceOutputBlueprint`
     - `WorkspaceOutputTelemetry`
     - `WorkspaceLLMUsageSummary`
  2. Export contracts from `Models/WorkspaceOutput.ts` and `Models/Workspace.ts`.

### Phase 4: Text Report Header Overhaul & Timing Tracking
- **Gate**: `bun x vitest run tests/integration/output/JsonSidecarOutput.test.ts`
- **Complexity**: Low
- **Risk**: Low
- **Planned Tests**: Tests verifying `.txt` header formatting (status, duration, summary counts, token counts) and timestamp generation.
- **Steps**:
  1. Track `startTime` (at beginning of `MainAgentV1.run()`) and `endTime` / `durationMs` upon finalization.
  2. Update `MainAgentV1.saveResults()` to generate an executive summary at the top of the `.txt` file:
     - Workspace name
     - Execution status & exit status
     - Execution duration (seconds/ms)
     - Total tasks, succeeded, failed, blocked counts
     - Models used
     - Token consumption summary (`promptTokens`, `completionTokens`, `totalTokens`)
     - Clear divider before task output listings

### Phase 5: JSON Restructuring & Telemetry Aggregates Implementation
- **Gate**: `bun x vitest run tests/unit/execution/ExecutionTracer.test.ts`
- **Complexity**: Medium
- **Risk**: Medium
- **Planned Tests**: Unit & integration tests verifying:
  - Output contains only the 5 namespaces (`meta`, `result`, `diagnostics`, `blueprint`, `telemetry`).
  - `meta.customMeta` is parsed as a JSON object (falling back to raw string if unparseable).
  - `telemetry.taskResults` maps each taskId to its result, status, reason, duration.
  - `telemetry.llmUsage` aggregates prompt tokens, completion tokens, call count, and total LLM duration.
  - `telemetry.llmInteractions[].usage` contains per-call token breakdown.
  - Large payload truncation in `safeSanitizeValue`.
- **Steps**:
  1. Implement `getLLMUsageSummary()` and output truncation guards in `Execution/ExecutionTracer.ts`.
  2. Refactor `MainAgentV1.saveResults()` to construct `WorkspaceOutputV2` partitioned into `meta`, `result`, `diagnostics`, `blueprint`, and `telemetry`.
  3. Update validation error and abort handlers in `MainAgentV1.ts` to output consistent v2 JSON payloads.

### Phase 6: Test Suite Updates & End-to-End Verification
- **Gate**: `bun x vitest run tests/integration/output/JsonSidecarOutput.test.ts && bun x vitest run tests/integration/routes/output.route.test.ts`
- **Complexity**: Medium
- **Risk**: Low
- **Planned Tests**: All integration and unit tests passing with 100% assertions on new schema and token tracking.
- **Steps**:
  1. Update `tests/integration/output/JsonSidecarOutput.test.ts` to assert all 5 namespaces, token usage, and executive text summary.
  2. Update `tests/unit/execution/ExecutionTracer.test.ts` to assert `wrapLLM` token recording and `getLLMUsageSummary()`.
  3. Verify route tests in `tests/integration/routes/output.route.test.ts` continue to pass.
  4. Run live test execution to generate sample output files in `Output/` and inspect for schema compliance.
