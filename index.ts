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

const app = express();
const PORT = 3001;

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

// Health check route
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Server is healthy 🚀" });
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

// Example: trigger broadcast from API
app.post("/broadcast", (req, res) => {
  wsUtils.broadcast({ type: "announcement", text: "Hello clients 🎉" });
  res.json({ success: true });
});

// Start HTTP + WebSocket server
server.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
  console.log(`🌐 WebSocket is available at ws://localhost:${PORT}`);
});
