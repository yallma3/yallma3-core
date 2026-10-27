# Routes (`Routes/`)

## Purpose
Express route handlers for LLM configuration management, MCP server management, workflow CRUD operations, and trigger endpoints.

## Route Handlers

### LLM Routes (`Routes/LLM.route.ts`) — Mounted at `/llm/*`

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| `GET` | `/models` | Yes* | — | `{ success: true, AvailableLLMs: LLMModel[] }` |
| `POST` | `/models` | Yes* | `LLMModel` | `{ success: true, model: LLMModel }` |
| `PUT` | `/models/:id` | Yes* | `LLMModel` | `{ success: true, model: LLMModel }` |
| `DELETE` | `/models/:id` | Yes* | — | `{ success: true }` |

*Requires `x-api-key` header when `--instance-id` is provided at startup.

### MCP Routes (`Routes/Mcp.route.ts`) — Mounted at `/mcp/*`

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| `POST` | `/health` | Yes* | `{ type: "STDIO"\|"HTTP", command?, args?, env?, url? }` | `{ status: "ok"\|"failed", type }` |
| `POST` | `/connect` | Yes* | `{ type: "STDIO"\|"HTTP", command?, args?, env?, url? }` | `{ tools: Tool[], prompts: Prompt[], resources: Resource[] }` |
| `POST` | `/http/connect` | Yes* | `?serverUrl=` | `{ tools, prompts, resources }` |
| `GET` | `/http/tools` | Yes* | `?serverUrl=` | `{ tools: Tool[] }` |
| `GET` | `/http/prompts` | Yes* | `?serverUrl=` | `{ prompts: Prompt[] }` |
| `GET` | `/http/resources` | Yes* | `?serverUrl=` | `{ resources: Resource[] }` |
| `POST` | `/stdio/connect` | Yes* | `{ command, args?, env? }` | `{ tools, prompts, resources }` |
| `POST` | `/stdio/tools` | Yes* | `{ command, args?, env? }` | `{ tools: Tool[] }` |
| `POST` | `/stdio/prompts` | Yes* | `{ command, args?, env? }` | `{ prompts: Prompt[] }` |
| `POST` | `/stdio/resources` | Yes* | `{ command, args?, env? }` | `{ resources: Resource[] }` |

*Requires `x-api-key` header when `--instance-id` is provided at startup.

### Workflow Routes (`Routes/workflow.route.ts`) — Mounted at `/workflow/*`

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| `GET` | `/nodes` | Yes* | — | `{ success: true, data: { nodes: NodeType[], categories: string[] }, count: number }` |

*Requires `x-api-key` header when `--instance-id` is provided at startup.

### Output Artifact Routes (`Routes/output.route.ts`) — Mounted at `/output/*`

| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| `GET` | `/download/:filename` | Token** | `?token=<uuid>` | Streams file with `Content-Disposition: attachment` |
| `GET` | `/view/:filename` | Token** | `?token=<uuid>` | Streams file with `Content-Type: application/json` or `text/plain` |

**Requires a valid ephemeral capability token passed in query parameter `?token=...`, issued by `OutputTokenManager`. Exempted from the `--instance-id` header requirement to allow standard browser link downloads. Strictly guards against path traversal (`../`) and confines file access to `./Output/`.

### Trigger Endpoints (in `index.ts`)

#### Webhook Trigger
| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| `POST` / `GET` | `/webhook/:workspaceId` | `x-webhook-secret` header | Any body | `202 { success: true, message: "Webhook enqueued", timestamp }` |
| `GET` | `/webhooks` | Yes* | — | `{ count: number, webhooks: WebhookRegistration[] }` |

#### Telegram Trigger
| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| `POST` | `/telegram/:workspaceId` | `x-telegram-bot-api-secret-token` header | Telegram Update object | `200 { ok: true }` |
| `GET` | `/telegram/bots` | Yes* | — | `{ count: number, bots: TelegramBotInfo[] }` |
| `GET` | `/telegram/:workspaceId` | Yes* | — | `{ ok: true, botInfo }` or `404 { ok: false, message }` |
| `GET` | `/telegram/queue/status` | Yes* | — | `{ pending: number, processing: number, ... }` |

#### Health Check (Unauthenticated)
| Method | Path | Auth | Request | Response |
|--------|------|------|---------|----------|
| `GET` | `/health` | No | — | `{ status: "ok", message: "Server is healthy 🚀" }` |

### Authentication
When `--instance-id` is specified at startup:
- All HTTP routes (except `/health`) require `x-api-key` header matching the instance ID
- All WebSocket connections require `x-api-key` header or `sec-websocket-protocol` matching the instance ID
- Webhook endpoints use `x-webhook-secret` header (validated against registered secret)
- Telegram endpoints use `x-telegram-bot-api-secret-token` header (validated against registered token)

### Error Response Format
All error responses follow:
```json
{
  "success": false,
  "error": "Error message",
  "details": "Optional error details"
}
```
Or for trigger endpoints:
```json
{
  "ok": false,
  "description": "Error description"
}
```

## Source Files
| File | Mount Path |
|------|-----------|
| `Routes/LLM.route.ts` | `/llm/*` |
| `Routes/Mcp.route.ts` | `/mcp/*` |
| `Routes/workflow.route.ts` | `/workflow/*` |
| `index.ts` | `/webhook/*`, `/telegram/*`, `/health`, `/webhooks`, `/telegram/*` |

## Dependencies
- **Consumes**: LLM config module, MCP client utilities (`McpSTDIOClient`, `McpHttpClient`), NodeRegistry, trigger managers, WebhookQueue, TelegramQueue
- **Consumed by**: `index.ts` (route registration)

## See Also
- [Entry Point](system_entry.md) — route registration, auth middleware
- [LLM System](system_llm.md) — config module, model structure
- [Utilities](system_utils.md) — MCP client utilities
- [Trigger System](system_triggers.md) — webhook/Telegram trigger managers