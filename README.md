# yallma3-core

yallma3-core is the core engine that executes AI agents and workflows. It exposes an HTTP/WebSocket API for interacting with agents.

## Related Projects

| Project | Description |
|---------|-------------|
| [yallma3-cli](https://github.com/yallma3/yallma3-cli) | CLI frontend to interact with the core |
| [studio](https://github.com/yallma3/studio) | GUI frontend to interact with the core |

## Prerequisites

### Required

- **[Bun](https://bun.sh)** v1.2.21 or higher

Bun is used as the runtime, package manager, and TypeScript executor.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `YALLMA3_AGENT_PORT` | `3001` (auto-increment if busy) | Server port. If set, fails if port unavailable. |
| `YALLMA3_AGENT_HOST` | `localhost` | Server host |

## Getting Started

### 1. Install Dependencies

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install
```

### 2. Development Mode

```bash
bun run start
```

### 3. Production Mode

```bash
# Build the server
bun run build

# Run with default settings (localhost:3001)
bun run serve

# Or specify custom host/port
YALLMA3_AGENT_HOST=0.0.0.0 YALLMA3_AGENT_PORT=8080 bun run serve
```

### 4. Run Tests

```bash
# Run tests
bun run test

# Run tests with coverage
bun run test:coverage
```

## Server Information

The application starts an HTTP server with WebSocket support. The host and port are determined by the environment variables (see above).

- **Health Check**: `GET http://<host>:<port>/health`

### Available Endpoints

- `GET /health` - Health check endpoint
- `POST /broadcast` - Trigger WebSocket broadcast
- `/webhook/:workspaceId` - Webhook trigger endpoint
- `/telegram/:workspaceId` - Telegram bot webhook endpoint
- `/telegram/bots` - List all registered Telegram bots
- `/telegram/queue/status` - Get Telegram queue status
- `/webhooks` - List all registered webhooks
- `/workflow/*` - Workflow management routes
- `/llm/*` - LLM management routes
- `/mcp/*` - MCP server routes

## Project Structure

```
├── Agent/           # Agent system and main agents
├── LLM/             # LLM providers and runners
├── Models/          # TypeScript models/interfaces
├── Routes/          # Express.js routes
├── Task/            # Task management and interpretation
├── Trigger/         # Trigger handlers
├── Utils/           # Utility functions and MCP clients
├── Websocket/       # WebSocket server setup
├── Workflow/        # Workflow system and nodes
├── tests/           # Test files
└── index.ts         # Main application entry point
```

## Build & Test

```bash
# Install dependencies
bun install

# Build the binary
bun run build

# Run the binary
./bin/yallma3

# Run tests
bun run test

# Run tests with coverage
bun run test:coverage
```
