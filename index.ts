import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import pkg from "./package.json" with { type: "json" };

const VERSION = pkg.version;

const args = process.argv.slice(2);

const KNOWN_FLAGS = ["--help", "-h", "--version", "-v"];
//const KNOWN_OPTIONS = ["--instance-id", "--port", "--bind-file"];

function parseArgs() {
  const parsed: Record<string, string | boolean> = {};
  const unknown: string[] = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    
    if (KNOWN_FLAGS.includes(arg)) {
      parsed[arg] = true;
    } else if (arg.startsWith("--instance-id=")) {
      parsed["--instance-id"] = arg.split("=")[1]!;
    } else if (arg.startsWith("--port=")) {
      parsed["--port"] = arg.split("=")[1]!;
    } else if (arg.startsWith("--bind-file=")) {
      parsed["--bind-file"] = arg.split("=")[1]!;
    } else if (arg === "--instance-id" && args[i + 1] !== undefined && !args[i + 1]!.startsWith("--")) {
      parsed["--instance-id"] = args[++i]!;
    } else if (arg === "--port" && args[i + 1] !== undefined && !args[i + 1]!.startsWith("--")) {
      parsed["--port"] = args[++i]!;
    } else if (arg === "--bind-file" && args[i + 1] !== undefined && !args[i + 1]!.startsWith("--")) {
      parsed["--bind-file"] = args[++i]!;
    } else {
      unknown.push(arg);
    }
  }
  
  return { parsed, unknown };
}

const { parsed: parsedArgs, unknown } = parseArgs();

if (unknown.length > 0) {
  console.error(`Error: Unknown argument(s): ${unknown.join(", ")}`);
  console.error(`Run 'yallma3 --help' for usage information.`);
  process.exit(1);
}

if (parsedArgs["--help"] || parsedArgs["-h"]) {
  console.log(`yallma3 v${VERSION}

Usage: yallma3 [options]

Options:
  -h, --help       Show this help message
  -v, --version    Show version number
  --instance-id    Unique identifier for this instance (creates binding file, also serves as API key)
  --port           Server port (default: 3001, auto-increment if busy)
  --bind-file      Path where the binding file should be written (default: cwd/yallma3-bind.<instance-id>, or cwd/yallma3-bind if only --bind-file is specified)

Environment Variables:
  YALLMA3_AGENT_HOST    Server host (default: localhost)
  YALLMA3_AGENT_PORT    Server port (default: 3001, auto-increment if busy)

Note: --port command line option takes precedence over YALLMA3_AGENT_PORT
`);
  process.exit(0);
}

if (parsedArgs["--version"] || parsedArgs["-v"]) {
  console.log(VERSION);
  process.exit(0);
}

const instanceId = parsedArgs["--instance-id"] as string | undefined;
const bindFilePath = parsedArgs["--bind-file"] as string | undefined;
const bindFile = bindFilePath || (instanceId ? `yallma3-bind.${instanceId}` : null);

const cliPort = parsedArgs["--port"] as string | undefined;

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
    if (cliPort !== undefined) {
      if (cliPort === "") {
        throw new Error(`Invalid --port command line argument: no value provided`);
      }
      const parsed = parseInt(cliPort, 10);
      if (isNaN(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid --port command line argument: ${cliPort}`);
      }
      return parsed;
    }
  
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

// API Key authentication middleware (only if instance-id is provided)
if (instanceId) {
  app.use((req, res, next) => {
    const clientApiKey = req.headers["x-api-key"] as string | undefined;
    
    if (!clientApiKey || clientApiKey !== instanceId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Invalid or missing x-api-key header",
      });
    }
    next();
  });
}

// Health check route (unauthenticated)
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
  const secretToken = req.headers["x-telegram-bot-api-secret-token"] as
    | string
    | undefined;
  const update = req.body;
  const _updateTypes = Object.keys(update).filter((k) => k !== "update_id");
  const registration = telegramTriggerManager.validateUpdate(
    workspaceId,
    secretToken
  );

  if (!registration) {
    return res.status(404).json({
      ok: false,
      description: "Bot not registered or invalid secret token",
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
    bots,
  });
});

// Get Telegram bot info for specific workspace
app.get("/telegram/:workspaceId", (req, res) => {
  const { workspaceId } = req.params;
  const info = telegramTriggerManager.getBotInfo(workspaceId);

  if (!info.exists) {
    return res.status(404).json({
      ok: false,
      message: "Bot not registered for this workspace",
    });
  }

  res.status(200).json({
    ok: true,
    ...info,
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
const wss = new WebSocketServer({ 
  server,
  verifyClient: instanceId ? (info: { req: { headers: Record<string, string | string[] | undefined> } }) => {
    const apiKey = info.req.headers["x-api-key"] as string | undefined;
    const wsProtocol = info.req.headers["sec-websocket-protocol"] as string | undefined;
    const clientKey = apiKey || wsProtocol;
    if (!clientKey || clientKey !== instanceId) {
      return false;
    }
    return true;
  } : undefined
});

// Setup your WebSocket utilities
setupWebSocketServer(wss, instanceId);
initFlowSystem();

async function startServer() {
  let boundPort: number;

  if (explicitPort !== undefined) {
    boundPort = explicitPort;
    await new Promise<void>((resolve, reject) => {
      server.once('error', (err: Error & {code?: string}) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${boundPort} is already in use`));
        } else if (err.code === 'EACCES') {
          reject(new Error(`Permission denied for port ${boundPort}. Use ports >= 1024`));
        } else {
          reject(err);
        }
      });
      try {
        server.listen(boundPort, host, () => resolve());
      } catch (err: unknown) {
        reject(err);
      }
    });
  } else {
    const findAvailablePort = async (startPort: number): Promise<number> => {
      for (let port = startPort; port <= 65535; port++) {
        console.log(`Trying port ${port}`);
        
        const portAvailable = await new Promise<boolean>((resolve) => {
          const testServer = createServer((req, res) => {
            res.end('OK');
          });
          
          testServer.on('error', (err: Error & { code?: string }) => {
            if (err.code === 'EADDRINUSE') {
              resolve(false);
            } else {
              resolve(false);
            }
          });
          
          testServer.listen(port, host, () => {
            testServer.close();
            resolve(true);
          });
        });
        
        if (portAvailable) {
          console.log(`Port ${port} is available`);
          return port;
        }
        
        console.log(`Port ${port} is in use, trying next...`);
      }
      
      throw new Error('No available port found');
    };

    boundPort = await findAvailablePort(3001);
    
    await new Promise<void>((resolve, reject) => {
      server.once('error', (err: Error & {code?: string}) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${boundPort} is already in use`));
        } else if (err.code === 'EACCES') {
          reject(new Error(`Permission denied for port ${boundPort}. Use ports >= 1024`));
        } else {
          reject(err);
        }
      });
      server.listen(boundPort, host, () => resolve());
    });
  }

  webhookTriggerManager.setBaseUrl(`http://${host}:${boundPort}`);
  telegramTriggerManager.setBaseUrl(`http://${host}:${boundPort}`);

  if (bindFile) {
    const dir = path.dirname(bindFile);
    if (dir && dir !== '.') {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(bindFile, JSON.stringify({ host, port: boundPort }));
  }

  console.log(`✅ Server is running at http://${host}:${boundPort}`);
  console.log(`🌐 WebSocket is available at ws://${host}:${boundPort}`);
  console.log(`🔗 Webhooks available at http://${host}:${boundPort}/webhook/:workspaceId`);
  console.log(`📱 Telegram webhooks at http://${host}:${boundPort}/telegram/:workspaceId`);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err.message);
  console.error('Full error:', err);
  console.error('Error message type:', typeof err.message);
  console.error('Error message includes in use:', err.message?.includes('in use'));
  if (err.message?.includes('in use') || err.message?.includes('Permission denied')) {
    console.error('Exiting with code 3');
    process.exit(3);
  }
  console.error('Exiting with code 1');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
  if (err.message?.includes('in use') || err.message?.includes('Permission denied')) {
    process.exit(3);
  }
  process.exit(1);
});

const cleanup = (signal: string) => {
  console.log(`\nReceived ${signal}, shutting down...`);
  if (bindFile) {
    try {
      fs.rmSync(bindFile, { force: true });
    } catch {
      // best effort cleanup
    }
  }
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
  // Force exit after 2 seconds if server.close() hangs
  setTimeout(() => {
    console.log("Forcing exit");
    process.exit(0);
  }, 2000);
};

process.on("SIGINT", () => cleanup("SIGINT"));
process.on("SIGTERM", () => cleanup("SIGTERM"));
process.on("exit", () => {
  if (bindFile) {
    try {
      fs.rmSync(bindFile, { force: true });
    } catch {
      // best effort cleanup
    }
  }
});