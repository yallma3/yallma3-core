# Product Requirements

## Overview

yallma3-core is a backend engine that executes AI agents and workflows. It exposes an HTTP/WebSocket API used by CLI (`yallma3-cli`) and GUI (`studio`) frontends. The engine manages LLM provider integration, workflow execution, trigger scheduling, webhook/Telegram handling, MCP server connectivity, and agent memory persistence.

## Design Concept

- **API-first engine**: Clean, consistent HTTP and WebSocket contracts with documented request/response schemas and error formats. Every feature is accessible programmatically.
- **Extensible by design**: Pluggable LLM providers, self-registering workflow nodes, toolkit architecture for tool calling. Components are added without modifying core infrastructure.
- **Developer-focused reliability**: Atomic file writes, graceful shutdown, port safety (auto-increment on conflict), consistent error propagation via structured error codes.
- **Real-time by nature**: WebSocket-first execution model for workspace runs, workflow execution, and trigger broadcasting. The ExecutionContext abstraction decouples transport (WS vs trigger-internal) from business logic.
- **LLM-agnostic integration**: Unified provider interface across 6+ LLM providers with capability registry for model selection. No vendor lock-in at the engine level.

## User Stories

- As a user, I want to...

## Acceptance Criteria

- [ ] Criterion 1

## Edge Cases

Document known edge cases here.

## Business Logic

Describe key business rules and constraints.

## BRDs
- [Structured JSON Output with Workflow Graph & LLM Logging](product_output_json.md) — Machine-readable workflow graph serialization, LLM interaction logging, and granular execution step tracing for AI agent consumption.

## Reliability & Compatibility Requirements

### R1 — Workspace identity isolation (Execution)
- The system must support concurrent/overlapping workspace executions without cross-workspace data or credential leakage.
- Acceptance: `ExecutionContext` carries explicit `workspaceId`; readers use injected ID; ambient `setCurrent/getCurrent` removed.

### R2 — Tool-execution cancellation (LLM)
- When a tool call exceeds its 30s timeout, execution must be cancelled, not merely abandoned.
- Acceptance: Tool executors accept `AbortSignal`; `executeTools` propagates cancellation and reports timeout.

### R3 — DeepSeek reasoning-content preservation (LLM)
- DeepSeek reasoning content must be preserved across tool-calling rounds.
- Acceptance: `callLLM` captures `reasoning_content` and includes it in subsequent message history.

### R4 — OpenAI token-parameter compatibility (LLM)
- Health probes/completions must work with o-series/GPT-5 models that reject `max_tokens`.
- Acceptance: Use `max_completion_tokens` (or provider-appropriate parameter) without breaking non-o models.

Status: R1–R4 pending (Heavy lift).
