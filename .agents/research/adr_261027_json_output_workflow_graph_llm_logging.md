# ADR 261027: Machine-Readable JSON Output with Workflow Graph, LLM Interactions, and Step Logs

## Context
When executing workspaces with `YALLMA3_OUTPUT_JSON=true` or `1`, yaLLMa3 generates an auxiliary JSON sidecar file. Up until now, this sidecar only stored high-level metadata, tasks status, and workflow stubs `{ id, name }`. Downstream AI agents and diagnostic tools could not:
1. Reconstruct or understand the executed workflow graphs (nodes, parameters, socket connections).
2. Trace the step-by-step execution across task assignment, agent iterations, and workflow node layers.
3. Access LLM prompts, tool invocations, completions, and latencies.

## Decision
Implement a dedicated `ExecutionTracer` and workflow graph sanitizer (`sanitizeWorkflowGraph`) to generate clean, machine-readable JSON sidecar output:
1. **Clean Workflow Graph**: Strips UI rendering coordinates (`x, y, width, height`), visual flags (`selected, processing`), and UI-only metadata (`i18n, acceptedFileTypes, UIConfigurable`). Retains semantic node types, titles, categories, clean key-value configuration parameters, input/output sockets, and typed connection edges with source and target socket titles and node IDs.
2. **LLM Interaction Logging**: Uses a non-invasive provider wrapper (`tracer.wrapLLM(provider, callerInfo)`) that intercepts `generateText` and `callLLM` to capture prompts, messages, responses, tool calls, latencies, and model identity.
3. **Execution Steps**: Logs task execution, agent reasoning iterations, and workflow node executions (including status: executed/skipped/failed, inputs received, and outputs generated).
4. **Sidecar Integration**: `MainAgentV1.saveResults()` consumes the tracer output and writes an uncluttered, structured JSON document alongside the text output.

## Consequences
- **Positive**: Complete observability for autonomous AI agents and evaluation pipelines; zero UI clutter in output; 100% backward compatibility with existing LLM providers and test mocks.
- **Negative / Trade-offs**: Slightly increased JSON file size (~20KB-200KB depending on prompt lengths), mitigated by only generating when `YALLMA3_OUTPUT_JSON` is enabled.
