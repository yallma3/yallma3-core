import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import pkg from "./package.json" with { type: "json" };

const VERSION = pkg.version;

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`yallma3 v${VERSION}

Usage: yallma3 [options]

Options:
  -h, --help     Show this help message
  -v, --version  Show version number

Environment Variables:
  YALLMA3_AGENT_HOST    Server host (default: localhost)
  YALLMA3_AGENT_PORT    Server port (default: 3001, auto-increment if busy)
`);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(VERSION);
  process.exit(0);
}

// import mcpRoutes from "./Routes/Mcp.route";
import workflowRoute from "./Routes/workflow.route";
import { setupWebSocketServer } from "./Websocket/socket";
import { initFlowSystem } from "./Workflow/initFlowSystem";
import mcpRoutes from "./Routes/Mcp.route";
import llmRoutes from "./Routes/LLM.route";
import { webhookTriggerManager } from "./Trigger/WebhookTriggerManager";
import { webhookQueue } from "./Trigger/WebhookQueue";
import { telegramTriggerManager } from "./Trigger/TelegramTriggerManager"; 
import { telegramQueue } from "./Trigger/TelegramQueue"; 

const app = express();

function getPort(): number | undefined {
  const envPort = process.env.YALLMA3_AGENT_PORT;
  if (envPort !== undefined) {
    const parsed = parseInt(envPort, 10);
    if (isNaN(parsed) || parsed <= 0 || parsed > 65535) {
      throw new Error(`Invalid YALLMA3_AGENT_PORT environment variable: ${envPort}`);
    }
    return parsed;
  }
  return undefined;
}

function getHost(): string {
  return process.env.YALLMA3_AGENT_HOST || "localhost";
}

const explicitPort = getPort();
const host = getHost();

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is healthy 🚀" });
});

// WEBHOOK ENDPOINT 
app.all("/webhook/:workspaceId", async (req, res) => {
  const { workspaceId } = req.params;
  const secret = req.headers["x-webhook-secret"] as string | undefined;
  const registration = webhookTriggerManager.validateWebhook(
    workspaceId,
    secret
  );

  if (!registration) {
    return res.status(404).json({
      success: false,
      message: "Webhook not found or invalid secret",
      timestamp: new Date().toISOString(),
    });
  }

  const payload = {
    method: req.method,
    headers: req.headers,
    body: req.body,
    query: req.query,
    timestamp: Date.now(),
  };

  webhookQueue.enqueue({ workspaceId, payload });

  return res.status(202).json({
    success: true,
    message: "Webhook enqueued",
    timestamp: new Date().toISOString(),
  });
});

// TELEGRAM WEBHOOK ENDPOINT
app.post("/telegram/:workspaceId", async (req, res) => {
  const { workspaceId } = req.params;
  const secretToken = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
  const update = req.body;
  const _updateTypes = Object.keys(update).filter(k => k !== 'update_id');
  const registration = telegramTriggerManager.validateUpdate(workspaceId, secretToken);

  if (!registration) {
    return res.status(404).json({
      ok: false,
      description: 'Bot not registered or invalid secret token'
    });
  }
  telegramQueue.enqueue({ workspaceId, update });

  return res.status(200).json({ ok: true });
});

// ============================================
// DEBUG ENDPOINTS
// ============================================

// List all webhooks
app.get("/webhooks", (req, res) => {
  const webhooks = webhookTriggerManager.getAllWebhooks();
  res.status(200).json({
    count: webhooks.length,
    webhooks,
  });
});

// List all Telegram bots
app.get("/telegram/bots", (req, res) => {
  const bots = telegramTriggerManager.getAllBots();
  res.status(200).json({
    count: bots.length,
    bots
  });
});

// Get Telegram bot info for specific workspace
app.get("/telegram/:workspaceId", (req, res) => {
  const { workspaceId } = req.params;
  const info = telegramTriggerManager.getBotInfo(workspaceId);
  
  if (!info.exists) {
    return res.status(404).json({
      ok: false,
      message: 'Bot not registered for this workspace'
    });
  }
  
  res.status(200).json({
    ok: true,
    ...info
  });
});

// Get Telegram queue status
app.get("/telegram/queue/status", (req, res) => {
  const status = telegramQueue.getStatus();
  res.status(200).json(status);
});


// MCP routes
app.use("/mcp", mcpRoutes);
// Workflow routes
app.use("/workflow", workflowRoute);
// LLM routes
app.use("/llm", llmRoutes);
// Create an HTTP server from Express
const server = createServer(app);

// Create a WebSocket server attached to the same HTTP server
const wss = new WebSocketServer({ server });

// Setup your WebSocket utilities
const wsUtils = setupWebSocketServer(wss);
initFlowSystem();

async function startServer() {
  let boundPort: number;

  if (explicitPort !== undefined) {
    boundPort = explicitPort;
    await new Promise<void>((resolve, reject) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${boundPort} is already in use`));
        } else {
          reject(err);
        }
      });
      server.listen(boundPort, host, () => resolve());
    });
  } else {
    const tryPort = (port: number): Promise<number> => {
      return new Promise((resolve, reject) => {
        server.once('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            if (port < 65535) {
              resolve(tryPort(port + 1));
            } else {
              reject(new Error('No available port found'));
            }
          } else {
            reject(err);
          }
        });
        server.listen(port, host, () => resolve(port));
      });
    };

    boundPort = await tryPort(3001);
  }

  webhookTriggerManager.setBaseUrl(`http://${host}:${boundPort}`);
  telegramTriggerManager.setBaseUrl(`http://${host}:${boundPort}`);

  console.log(`✅ Server is running at http://${host}:${boundPort}`);
  console.log(`🌐 WebSocket is available at ws://${host}:${boundPort}`);
  console.log(`🔗 Webhooks available at http://${host}:${boundPort}/webhook/:workspaceId`);
  console.log(`📱 Telegram webhooks at http://${host}:${boundPort}/telegram/:workspaceId`);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
