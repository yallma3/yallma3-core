import express from "express";
import { McpSTDIOClient } from "../Utils/McpStdioClient";
import { McpHttpClient } from "../Utils/McpHttpClient";
import type { ServerConfig } from "../Models/Mcp";

const router = express.Router();

// Check MCP Server health STDIO or HTTP
router.post("/health", async (req, res) => {
  try {
    const mcpConfig = req.body;

    if (!mcpConfig || !mcpConfig.type) {
      return res.status(400).json({ error: "Missing MCP configuration" });
    }

    if (mcpConfig.type === "STDIO") {
      console.log("[HealthCheck] Testing STDIO MCP server...");

      const serverConfig: ServerConfig = {
        command: mcpConfig.command,
        args: mcpConfig.args || [],
      };

      const client = new McpSTDIOClient(serverConfig);
      const ok = await client.test();

      if (ok) {
        return res.status(200).json({ status: "ok", type: "STDIO" });
      } else {
        return res.status(500).json({ status: "failed", type: "STDIO" });
      }
    }

    if (mcpConfig.type === "HTTP") {
      console.log("[HealthCheck] Testing HTTP MCP server...");

      if (!mcpConfig.url) {
        return res.status(400).json({ error: "Missing server URL" });
      }

      const client = new McpHttpClient(mcpConfig.url);
      const ok = await client.test();

      if (ok) {
        return res.status(200).json({ status: "ok", type: "HTTP" });
      } else {
        return res.status(500).json({ status: "failed", type: "HTTP" });
      }
    }

    return res.status(400).json({ error: "Unsupported MCP type" });
  } catch (error) {
    console.error("Error checking MCP health:", error);
    return res.status(500).json({
      error: "MCP server health check failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});
// Auto connect to MCP STDIO or HTTP
router.post("/connect", async (req, res) => {
  try {
    const mcpConfig = req.body;
    console.log(mcpConfig);
    let tools: unknown = [];
    let prompts: unknown = [];
    let resources: unknown = [];

    if (mcpConfig.type == "STDIO") {
      console.log("STDIO");
      const serverConfig: ServerConfig = {
        command: mcpConfig.command,
        args: mcpConfig.args,
      };
      const client = new McpSTDIOClient(serverConfig);
      await client.init();
      tools = await client.listTools();
      prompts = await client.listPrompts();
      resources = await client.listResources();
    } else if (mcpConfig.type == "HTTP") {
      console.log("HTTP");
      const serverUrl = mcpConfig.url;

      const client = new McpHttpClient(serverUrl);
      await client.init();
      tools = await client.listTools();
      prompts = await client.listPrompts();
      resources = await client.listResources();
    }

    // res.json({ tools, prompts, resources });
    res.json({ tools, prompts, resources });
  } catch (error) {
    console.error("Error listing tools from STDIO server:", error);
    res.status(500).json({
      error: "Failed to list tools",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// HTTP Client Routes

router.post("/http/connect", async (req, res) => {
  try {
    const { serverUrl } = req.query;
    if (!serverUrl || typeof serverUrl !== "string") {
      return res
        .status(400)
        .json({ error: "serverUrl query parameter is required" });
    }
    console.log(serverUrl);
    const client = new McpHttpClient(serverUrl);
    await client.init();
    const tools = await client.listTools();
    const prompts = await client.listPrompts();
    const resources = await client.listResources();

    res.json({ tools, prompts, resources });
  } catch (error) {
    console.error("Error listing tools from STDIO server:", error);
    res.status(500).json({
      error: "Failed to list tools",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get tools from HTTP MCP server
router.get("/http/tools", async (req, res) => {
  try {
    const { serverUrl } = req.query;
    if (!serverUrl || typeof serverUrl !== "string") {
      return res
        .status(400)
        .json({ error: "serverUrl query parameter is required" });
    }
    const client = new McpHttpClient(serverUrl);
    await client.init();
    const tools = await client.listTools();
    res.json({ tools });
  } catch (error) {
    console.error("Error listing tools from HTTP server:", error);
    res.status(500).json({
      error: "Failed to list tools",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get prompts from HTTP MCP server
router.get("/http/prompts", async (req, res) => {
  try {
    const { serverUrl } = req.query;
    if (!serverUrl || typeof serverUrl !== "string") {
      return res
        .status(400)
        .json({ error: "serverUrl query parameter is required" });
    }
    const client = new McpHttpClient(serverUrl);
    await client.init();
    const prompts = await client.listPrompts();
    res.json({ prompts });
  } catch (error) {
    console.error("Error listing prompts from HTTP server:", error);
    res.status(500).json({
      error: "Failed to list prompts",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get resources from HTTP MCP server
router.get("/http/resources", async (req, res) => {
  try {
    const { serverUrl } = req.query;
    if (!serverUrl || typeof serverUrl !== "string") {
      return res
        .status(400)
        .json({ error: "serverUrl query parameter is required" });
    }
    const client = new McpHttpClient(serverUrl);
    await client.init();
    const resources = await client.listResources();
    res.json({ resources });
  } catch (error) {
    console.error("Error listing resources from HTTP server:", error);
    res.status(500).json({
      error: "Failed to list resources",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// STDIO Client Routes

router.post("/stdio/connect", async (req, res) => {
  try {
    const serverConfig = req.body;
    if (!serverConfig || !serverConfig.command) {
      return res.status(400).json({
        error: "serverConfig with command is required in request body",
      });
    }
    console.log(serverConfig);

    const client = new McpSTDIOClient(serverConfig);
    await client.init();
    const tools = await client.listTools();
    const prompts = await client.listPrompts();
    const resources = await client.listResources();

    res.json({ tools, prompts, resources });
  } catch (error) {
    console.error("Error listing tools from STDIO server:", error);
    res.status(500).json({
      error: "Failed to list tools",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get tools from STDIO MCP server
router.post("/stdio/tools", async (req, res) => {
  try {
    const serverConfig = req.body;
    if (!serverConfig || !serverConfig.command) {
      return res.status(400).json({
        error: "serverConfig with command is required in request body",
      });
    }

    const client = new McpSTDIOClient(serverConfig);
    await client.init();
    const tools = await client.listTools();
    res.json({ tools });
  } catch (error) {
    console.error("Error listing tools from STDIO server:", error);
    res.status(500).json({
      error: "Failed to list tools",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get prompts from STDIO MCP server
router.post("/stdio/prompts", async (req, res) => {
  try {
    const serverConfig = req.body;
    if (!serverConfig || !serverConfig.command) {
      return res.status(400).json({
        error: "serverConfig with command is required in request body",
      });
    }
    const client = new McpSTDIOClient(serverConfig);
    await client.init();
    const prompts = await client.listPrompts();
    res.json({ prompts });
  } catch (error) {
    console.error("Error listing prompts from STDIO server:", error);
    res.status(500).json({
      error: "Failed to list prompts",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// Get resources from STDIO MCP server
router.post("/stdio/resources", async (req, res) => {
  try {
    const serverConfig = req.body;
    if (!serverConfig || !serverConfig.command) {
      return res.status(400).json({
        error: "serverConfig with command is required in request body",
      });
    }
    const client = new McpSTDIOClient(serverConfig);
    await client.init();
    const resources = await client.listResources();
    res.json({ resources });
  } catch (error) {
    console.error("Error listing resources from STDIO server:", error);
    res.status(500).json({
      error: "Failed to list resources",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
