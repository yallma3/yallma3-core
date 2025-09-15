import express from "express";
import mcpRoutes from "./Routes/Mcp.route";
import cors from "cors";

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

app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});
