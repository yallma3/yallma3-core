# yallma3-core

## Prerequisites

Before running this project, ensure you have the following installed:

### Required

- **[Bun](https://bun.com)** v1.2.21 or higher
- **Node.js** v18+
- **TypeScript** v5+

### Installation

Install Bun if you haven't already:

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Or using npm
npm install -g bun
```

## Getting Started

### 1. Install Dependencies

```bash
bun install
```

### 2. Development Mode

Run the server with hot reload:

```bash
bun run start
```

Or directly:

```bash
bun run --watch index.ts
```

### 3. Production Mode

Run without hot reload:

```bash
bun run index.ts
```

## Server Information

The application starts an HTTP server with WebSocket support:

- **HTTP Server**: `http://localhost:3001`
- **WebSocket Server**: `ws://localhost:3001`
- **Health Check**: `GET http://localhost:3001/health`

### Available Endpoints

- `GET /health` - Health check endpoint
- `POST /broadcast` - Trigger WebSocket broadcast
- `/workflow/*` - Workflow management routes

## Project Structure

```
├── Agent/           # Agent system and main agents
├── Data/            # Data storage (PDFs, etc.)
├── LLM/             # LLM providers and runners
├── Models/          # TypeScript models/interfaces
├── Routes/          # Express.js routes
├── Task/            # Task management and interpretation
├── Utils/           # Utility functions and MCP clients
├── Websocket/       # WebSocket server setup
├── Workflow/        # Workflow system and nodes
└── index.ts         # Main application entry point
```
