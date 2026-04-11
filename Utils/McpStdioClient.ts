import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  getTools,
  callTool,
  getPrompts,
  getPrompt,
  getResources,
  getResource,
} from "./Mcp";
import { type ToolCall, type ServerConfig } from "../Models/Mcp";

export class McpSTDIOClient {
  private serverConfig: ServerConfig;
  private client: Client;

  constructor(serverConfig: ServerConfig) {
    this.client = new Client({
      name: "http-client",
      version: "1.0.0",
    });
    this.serverConfig = serverConfig;
  }

  async init() {
    try {
      const transport = new StdioClientTransport({
        command: this.serverConfig.command,
        args: this.serverConfig.args || [],
        env: {
          ...process.env,
          ...(this.serverConfig.env || {}),
        } as Record<string, string>,
      });
      await Promise.race([
        this.client.connect(transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Connection timed out after 5 minutes")), 300000)
        ),
      ]);

      console.log("connected");
    } catch (err) {
      console.error("[MCP STDIO] Failed to initialize connection:", err);
      throw err;
    }
  }

  async test() {
    try {
      const transport = new StdioClientTransport({
        command: this.serverConfig.command,
        args: this.serverConfig.args || [],
        env: {
          ...process.env,
          ...(this.serverConfig.env || {}),
        } as Record<string, string>,
      });

      const testClient = new Client({ name: "http-client", version: "1.0.0" });

      await Promise.race([
        testClient.connect(transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Test connection timed out")), 300000)
        ),
      ]);

      console.log("Connected to MCP STDIO server successfully");
      testClient.close();
      return true;
    } catch (err) {
      console.error("STDIO MCP connection failed:", err);
      return false;
    }
  }

  async listTools() {
    try {
      const response = await getTools(this.client);
      return response;
    } catch (err) {
      console.error("[MCP STDIO] Failed to list tools, returning empty array:", err);
      return [];
    }
  }
  async callTool(toolCall: ToolCall) {
    try {
      const response = await callTool(this.client, toolCall);
      return response;
    } catch (err) {
      console.error("[MCP STDIO] Failed to call tool:", toolCall.tool, err);
      throw err;
    }
  }
  async listPrompts() {
    try {
      const response = await getPrompts(this.client);
      return response;
    } catch (err) {
      console.error("[MCP STDIO] Failed to list prompts, returning empty array:", err);
      return [];
    }
  }
  async getPrompt(prompt: string) {
    try {
      const response = await getPrompt(this.client, prompt);
      return response;
    } catch (err) {
      console.error("[MCP STDIO] Failed to get prompt:", prompt, err);
      throw err;
    }
  }
  async listResources() {
    try {
      const response = await getResources(this.client);
      return response;
    } catch (err) {
      console.error("[MCP STDIO] Failed to list resources, returning empty array:", err);
      return [];
    }
  }
  async getResource(resource: string) {
    try {
      const response = await getResource(this.client, resource);
      return response;
    } catch (err) {
      console.error("[MCP STDIO] Failed to get resource:", resource, err);
      throw err;
    }
  }
  async close() {
    await this.client.close();
  }
}
