import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  getTools,
  callTool,
  getPrompts,
  getPrompt,
  getResources,
  getResource,
} from "./Mcp";
import { type ToolCall } from "../Models/Mcp";

export class McpHttpClient {
  private serverUrl: string = "http://localhost:3001/mcp";
  private client: Client;

  constructor(serverUrl: string) {
    this.client = new Client({
      name: "http-client",
      version: "1.0.0",
    });
    this.serverUrl = serverUrl;
  }

  async init() {
    const url = new URL(this.serverUrl);

    try {
      const transport = new StreamableHTTPClientTransport(url);
      await this.client.connect(transport);
    } catch (err) {
      const sseTransport = new SSEClientTransport(url);
      await this.client.connect(sseTransport);
    }
  }

  async test(): Promise<boolean> {
    const url = new URL(this.serverUrl);

    // Try Streamable HTTP first
    try {
      const transport = new StreamableHTTPClientTransport(url);
      await this.client.connect(transport);
      console.log(
        "[MCP HTTP] Connected successfully via Streamable HTTP transport."
      );
      this.client.close();
      return true;
    } catch (err1) {
      console.warn("[MCP HTTP] Streamable transport failed:", err1);

      // Fallback: try SSE
      try {
        const sseTransport = new SSEClientTransport(url);
        await this.client.connect(sseTransport);
        console.log("[MCP HTTP] Connected successfully via SSE transport.");
        this.client.close();
        return true;
      } catch (err2) {
        console.error("[MCP HTTP] SSE transport also failed:", err2);
        throw new Error(
          `Failed to connect to MCP HTTP server via both transports.\nStreamable error: ${err1}\nSSE error: ${err2}`
        );
      }
    }
  }

  async listTools() {
    try {
      const response = await getTools(this.client);
      return response;
    } catch (err) {
      return err;
    }
  }
  async callTool(toolCall: ToolCall) {
    try {
      const response = await callTool(this.client, toolCall);
      return response;
    } catch (err) {
      throw err;
    }
  }
  async listPrompts() {
    try {
      const response = await getPrompts(this.client);
      return response;
    } catch (err) {
      return err;
    }
  }
  async getPrompt(prompt: string) {
    try {
      const response = await getPrompt(this.client, prompt);
      return response;
    } catch (err) {
      throw err;
    }
  }
  async listResources() {
    try {
      const response = await getResources(this.client);
      return response;
    } catch (err) {
      return err;
    }
  }
  async getResource(resource: string) {
    try {
      const response = await getResource(this.client, resource);
      return response;
    } catch (err) {
      throw err;
    }
  }
  async close() {
    await this.client.close();
  }
}
