# ADR 261105: Structured JSON Output Re-architecture (v2), Token Consumption Tracing, and Text Observability Enhancements

## Context
When `YALLMA3_OUTPUT_JSON=true` is enabled, yaLLMa3 writes a JSON sidecar file alongside the execution text file in `Output/`.
In v1, the JSON sidecar flattened over 20 disparate attributes at the root level. This created several issues:
1. Declarative workspace blueprint configurations (workflows, task connections, agent definitions, prompts) were mingled with runtime telemetry (steps, task statuses, logs, LLM traces).
2. Autonomous optimization agents and evaluators faced unnecessary parsing friction trying to isolate static graph inputs from runtime execution results.
3. Metadata was fragmented across the top and bottom of the JSON object, and `meta` was double-serialized as an escaped JSON string.
4. Workspace-level timing (`startTime`, `endTime`, `durationMs`) was absent.
5. Upstream LLM providers (OpenAI, DeepSeek, Claude, Gemini, Groq, OpenRouter, Ollama) return token consumption counts, but `callLLM()` and `generateText()` in `LLMProvider.ts` discarded these metrics, leaving no token observability in telemetry.
6. The accompanying `.txt` file lacked an executive summary block at the top, forcing developers to scan all task rows to discern run success, elapsed time, and token spend.

As confirmed, there are no legacy consumers requiring backward compatibility for the flat v1 schema.

## Decision
1. **Partition JSON Sidecar into 5 Clean Namespaces (v2.0.0)**:
   - **`meta`**: Run-level metadata (`workspace`, `workspaceId`, `version: "2.0.0"`, `startTime`, `endTime`, `durationMs`, `generatedAt`, and parsed native `customMeta`).
   - **`result`**: Truthful run outcome (`status`, `exitStatus`, `statusReason`, `summary` counts, and `finalOutput`).
   - **`diagnostics`**: First-class failure attribution (`hasFailures`, `rootCauses[]`, and `impactedTasks[]`).
   - **`blueprint`**: Pure declarative workspace specification (`mainLLM`, `agents[]`, `workflows[]`, `tasks[]`, and `taskConnections[]`).
   - **`telemetry`**: Pure runtime telemetry (`taskResults` map, chronological `steps[]`, `llmInteractions[]` with token consumption, `llmUsage` token aggregate roll-up, and `logs[]`).
2. **End-to-End Token Consumption Tracing**:
   - Define `TokenUsage` interface (`promptTokens`, `completionTokens`, `totalTokens`).
   - Extract upstream usage metrics across all providers in `LLMProvider.ts` (`json.usage`, `json.usageMetadata`, `response.eval_count`).
   - Accumulate tokens in `generateText()` across multi-turn tool loops.
   - Intercept and record `usage` per `LLMInteraction` in `ExecutionTracer.ts` and compute workspace-level `telemetry.llmUsage` roll-up.
3. **Native JSON Parsing for `meta`**:
   - Parse `results["__meta__"]` as a native JSON object under `meta.customMeta` (falling back to raw string if invalid).
4. **Executive Summary Header in Text Output (`.txt`)**:
   - Place a clear status, exit status, duration, task counts, and token consumption summary header at the top of the `.txt` report.
5. **No Backward Compatibility Shim**:
   - Clean break directly to v2 structure; no legacy root key aliases.

## Consequences
- **Positive**:
  - Clear separation of concerns between inputs (blueprint) and outputs (telemetry).
  - High-resolution auditability of token expenditure per task, agent, and workspace run.
  - Frictionless parsing for autonomous self-healing and optimization agents.
  - Comprehensive execution timing and token efficiency metrics.
  - Immediate visibility of workspace outcome and cost in text reports.
- **Negative / Trade-offs**:
  - Existing integration test assertions checking flat v1 root keys must be updated to the v2 namespaced schema.
