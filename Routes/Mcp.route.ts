// import express from "express";
// import { stdioListTools, stdioToolCall, stdioListPrompts, stdioGetPrompt, stdioListResources, stdioGetResource } from "../Utils/McpStdioClient";

// const router = express.Router();

// // HTTP Client Routes

// // Get tools from HTTP MCP server
// router.get("/http/tools", async (req, res) => {
//   try {
//     const { serverUrl } = req.query;
//     if (!serverUrl || typeof serverUrl !== 'string') {
//       return res.status(400).json({ error: "serverUrl query parameter is required" });
//     }

//     const tools = await httpListTools(serverUrl);
//     res.json({ tools });
//   } catch (error) {
//     console.error("Error listing tools from HTTP server:", error);
//     res.status(500).json({ error: "Failed to list tools", details: error instanceof Error ? error.message : String(error) });
//   }
// });

// // Call a tool on HTTP MCP server
// router.post("/http/tools/call", async (req, res) => {
//   try {
//     const { serverUrl, toolCall } = req.body;
//     if (!serverUrl || typeof serverUrl !== 'string') {
//       return res.status(400).json({ error: "serverUrl is required in request body" });
//     }
//     if (!toolCall || typeof toolCall !== 'object' || !toolCall.tool) {
//       return res.status(400).json({ error: "toolCall object with name property is required in request body" });
//     }

//     const result = await httpToolCall(serverUrl, toolCall);
//     res.json({ result });
//   } catch (error) {
//     console.error("Error calling tool on HTTP server:", error);
//     res.status(500).json({ error: "Failed to call tool", details: error instanceof Error ? error.message : String(error) });
//   }
// });

// // Get prompts from HTTP MCP server
// router.get("/http/prompts", async (req, res) => {
//   try {
//     const { serverUrl } = req.query;
//     if (!serverUrl || typeof serverUrl !== 'string') {
//       return res.status(400).json({ error: "serverUrl query parameter is required" });
//     }

//     const prompts = await httpListPrompts(serverUrl);
//     res.json({ prompts });
//   } catch (error) {
//     console.error("Error listing prompts from HTTP server:", error);
//     res.status(500).json({ error: "Failed to list prompts", details: error instanceof Error ? error.message : String(error) });
//   }
// });

// // Get specific prompt from HTTP MCP server
// router.get("/http/prompts/:prompt", async (req, res) => {
//   try {
//     const { serverUrl } = req.query;
//     const { prompt } = req.params;

//     if (!serverUrl || typeof serverUrl !== 'string') {
//       return res.status(400).json({ error: "serverUrl query parameter is required" });
//     }
//     if (!prompt || typeof prompt !== 'string') {
//       return res.status(400).json({ error: "prompt parameter is required" });
//     }

//     const promptResult = await httpGetPrompt(serverUrl, prompt);
//     res.json({ prompt: promptResult });
//   } catch (error) {
//     console.error("Error getting prompt from HTTP server:", error);
//     res.status(500).json({ error: "Failed to get prompt", details: error instanceof Error ? error.message : String(error) });
//   }
// });

// // Get resources from HTTP MCP server
// router.get("/http/resources", async (req, res) => {
//   try {
//     const { serverUrl } = req.query;
//     if (!serverUrl || typeof serverUrl !== 'string') {
//       return res.status(400).json({ error: "serverUrl query parameter is required" });
//     }

//     const resources = await httpListResources(serverUrl);
//     res.json({ resources });
//   } catch (error) {
//     console.error("Error listing resources from HTTP server:", error);
//     res.status(500).json({ error: "Failed to list resources", details: error instanceof Error ? error.message : String(error) });
//   }
// });

// // Get specific resource from HTTP MCP server
// router.get("/http/resources/:resource", async (req, res) => {
//   try {
//     const { serverUrl } = req.query;
//     const { resource } = req.params;

//     if (!serverUrl || typeof serverUrl !== 'string') {
//       return res.status(400).json({ error: "serverUrl query parameter is required" });
//     }
//     if (!resource || typeof resource !== 'string') {
//       return res.status(400).json({ error: "resource parameter is required" });
//     }

//     const resourceResult = await httpGetResource(serverUrl, resource);
//     res.json({ resource: resourceResult });
//   } catch (error) {
//     console.error("Error getting resource from HTTP server:", error);
//     res.status(500).json({ error: "Failed to get resource", details: error instanceof Error ? error.message : String(error) });
//   }
// });

// // STDIO Client Routes

// // Get tools from STDIO MCP server
// router.post("/stdio/tools", async (req, res) => {
//   try {
//     const serverConfig = req.body;
//     if (!serverConfig || !serverConfig.command) {
//       return res.status(400).json({ error: "serverConfig with command is required in request body" });
//     }

//     const tools = await stdioListTools(serverConfig);
//     res.json({ tools });
//   } catch (error) {
//     console.error("Error listing tools from STDIO server:", error);
//     res.status(500).json({ error: "Failed to list tools", details: error instanceof Error ? error.message : String(error) });
//   }
// });

// // Call a tool on STDIO MCP server
// router.post("/stdio/tools/call", async (req, res) => {
//   try {
//     const { serverConfig, toolCall } = req.body;
//     if (!serverConfig || !serverConfig.command) {
//       return res.status(400).json({ error: "serverConfig with command is required in request body" });
//     }
//     console.log(toolCall)

//     if (!toolCall || typeof toolCall !== 'object' || !toolCall.tool) {
//       return res.status(400).json({ error: "toolCall object with name property is required in request body" });
//     }

//     const result = await stdioToolCall(serverConfig, toolCall);
//     res.json({ result });
//   } catch (error) {
//     console.error("Error calling tool on STDIO server:", error);
//     res.status(500).json({ error: "Failed to call tool", details: error instanceof Error ? error.message : String(error) });
//   }
// });

// // Get prompts from STDIO MCP server
// router.post("/stdio/prompts", async (req, res) => {
//   try {
//     const serverConfig = req.body;
//     if (!serverConfig || !serverConfig.command) {
//       return res.status(400).json({ error: "serverConfig with command is required in request body" });
//     }

//     const prompts = await stdioListPrompts(serverConfig);
//     res.json({ prompts });
//   } catch (error) {
//     console.error("Error listing prompts from STDIO server:", error);
//     res.status(500).json({ error: "Failed to list prompts", details: error instanceof Error ? error.message : String(error) });
//   }
// });

// // Get specific prompt from STDIO MCP server
// router.post("/stdio/prompts/:prompt", async (req, res) => {
//   try {
//     const { prompt } = req.params;
//     const serverConfig = req.body;

//     if (!serverConfig || !serverConfig.command) {
//       return res.status(400).json({ error: "serverConfig with command is required in request body" });
//     }
//     if (!prompt || typeof prompt !== 'string') {
//       return res.status(400).json({ error: "prompt parameter is required" });
//     }

//     const promptResult = await stdioGetPrompt(serverConfig, prompt);
//     res.json({ prompt: promptResult });
//   } catch (error) {
//     console.error("Error getting prompt from STDIO server:", error);
//     res.status(500).json({ error: "Failed to get prompt", details: error instanceof Error ? error.message : String(error) });
//   }
// });

// // Get resources from STDIO MCP server
// router.post("/stdio/resources", async (req, res) => {
//   try {
//     const serverConfig = req.body;
//     if (!serverConfig || !serverConfig.command) {
//       return res.status(400).json({ error: "serverConfig with command is required in request body" });
//     }

//     const resources = await stdioListResources(serverConfig);
//     res.json({ resources });
//   } catch (error) {
//     console.error("Error listing resources from STDIO server:", error);
//     res.status(500).json({ error: "Failed to list resources", details: error instanceof Error ? error.message : String(error) });
//   }
// });

// // Get specific resource from STDIO MCP server
// router.post("/stdio/resources/:resource", async (req, res) => {
//   try {
//     const { resource } = req.params;
//     const serverConfig = req.body;

//     if (!serverConfig || !serverConfig.command) {
//       return res.status(400).json({ error: "serverConfig with command is required in request body" });
//     }
//     if (!resource || typeof resource !== 'string') {
//       return res.status(400).json({ error: "resource parameter is required" });
//     }

//     const resourceResult = await stdioGetResource(serverConfig, resource);
//     res.json({ resource: resourceResult });
//   } catch (error) {
//     console.error("Error getting resource from STDIO server:", error);
//     res.status(500).json({ error: "Failed to get resource", details: error instanceof Error ? error.message : String(error) });
//   }
// });

// export default router;
