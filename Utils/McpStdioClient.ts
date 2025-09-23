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
    console.log("initializing");
    try {
      const transport = new StdioClientTransport({
        command: this.serverConfig.command,
        args: this.serverConfig.args || [],
      });
      await this.client.connect(transport);
      console.log("connected");
    } catch (err) {
      throw err;
    }
  }

  async listTools() {
    try {
      const response = await getTools(this.client);
      return response;
    } catch (err) {
      return [];
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
      return [];
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
      return [];
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
