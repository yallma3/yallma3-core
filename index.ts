import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";

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
const PORT = 3001;

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

// Configure base URLs for trigger managers
webhookTriggerManager.setBaseUrl(`http://localhost:${PORT}`);
telegramTriggerManager.setBaseUrl(`http://localhost:${PORT}`); 

// Example: trigger broadcast from API
app.post("/broadcast", (req, res) => {
  wsUtils.broadcast({ type: "announcement", text: "Hello clients 🎉" });
  res.json({ success: true });
});

// Start server
server.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
  console.log(`🌐 WebSocket is available at ws://localhost:${PORT}`);
  console.log(`🔗 Webhooks available at http://localhost:${PORT}/webhook/:workspaceId`);
  console.log(`📱 Telegram webhooks at http://localhost:${PORT}/telegram/:workspaceId`);
});
