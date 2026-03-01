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
| `YALLMA3_AGENT_PORT` | `3001` (auto-increment if busy) | Server port. If set, fails if port unavailable. Can be overridden by `--port` CLI option. |
| `YALLMA3_AGENT_HOST` | `localhost` | Server host |

### Command Line Options

| Option | Description |
|--------|-------------|
| `-h`, `--help` | Show help message |
| `-v`, `--version` | Show version number |
| `--port <port>` | Server port (default: 3001, auto-increment if busy). Takes precedence over `YALLMA3_AGENT_PORT`. |
| `--instance-id <id>` | Unique identifier for this instance (creates binding file). Also serves as API key for authentication. |
| `--bind-file <path>` | Path where the binding file should be written. Default: `yallma3-bind.<instance-id>` in cwd (or `yallma3-bind` if only --bind-file is specified). |

### Authentication

When `--instance-id` is specified, all HTTP and WebSocket requests must include the `x-api-key` header with the instance ID as the value:

```bash
# Authorized request example
curl -H "x-api-key: myinstance" http://localhost:3001/health
```

If `--instance-id` is not specified, the server accepts requests without authentication.

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

# Or specify custom host/port via environment variable
YALLMA3_AGENT_HOST=0.0.0.0 YALLMA3_AGENT_PORT=8080 bun run serve

# Or specify port via command line (takes precedence over env var)
bun run serve --port=8080
```

### 4. Run Tests

```bash
# Run tests
bun run test

# Run tests with coverage
bun run test:coverage
```

### 5. Instance Binding File

When running as a child process, use `--instance-id` to create a binding file that contains the host and port:

```bash
bun run serve --instance-id=abc
# Creates: yallma3-bind.abc with {"host":"localhost","port":3001}
```

You can also specify a custom path for the binding file:

```bash
bun run serve --instance-id=abc --bind-file=/var/run/yallma3-bind.abc
# Creates: /var/run/yallma3-bind.abc

# Or without instance-id (for non-authenticated mode):
bun run serve --bind-file=/tmp/yallma3-bind
# Creates: /tmp/yallma3-bind
```

The file is created in the current working directory (or custom path) and is automatically removed on process exit.

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
