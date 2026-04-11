import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type ToolCall } from "../Models/Mcp";
const REQUEST_TIMEOUT_MS = 300_000; 

export const getTools = async (client: Client) => {
  try {
    const toolsResult = await client.listTools(
      undefined,
      { timeout: REQUEST_TIMEOUT_MS }
    );

    const mcpTools = toolsResult.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
    return mcpTools;
  } catch (err) {
    console.error("[MCP] Failed to get tools:", err);
    throw err;
  }
};

export const callTool = async (client: Client, toolCall: ToolCall) => {
  try {
    const toolResponse = await client.callTool(
      {
        name: toolCall.tool,
        arguments: toolCall.input,
      },
      undefined,
      { timeout: REQUEST_TIMEOUT_MS }
    );

    const response = {
      content: toolResponse.content,
      isError: toolResponse.isError,
    };

    return response;
  } catch (err) {
    console.error("[MCP] Failed to call tool:", toolCall.tool, err);
    throw err;
  }
};

export const getPrompts = async (client: Client) => {
  try {
    const promptsResult = await client.listPrompts(
      undefined,
      { timeout: REQUEST_TIMEOUT_MS }
    );

    const mcpPrompts = promptsResult.prompts.map((prompt) => ({
      name: prompt.name,
      description: prompt.description,
      arugments: prompt.arguments,
    }));
    return mcpPrompts;
  } catch (err) {
    console.error("[MCP] Failed to get prompts:", err);
    throw err;
  }
};

export const getPrompt = async (client: Client, getPrompt: string) => {
  try {
    const promptResult = await client.getPrompt(
      { name: getPrompt },
      { timeout: REQUEST_TIMEOUT_MS }
    );
    const mcpPrompt = {
      description: promptResult.description,
      messages: promptResult.messages,
    };

    return mcpPrompt;
  } catch (err) {
    console.error("[MCP] Failed to get prompt:", getPrompt, err);
    throw err;
  }
};

export const getResources = async (client: Client) => {
  try {
    const resourcesResult = await client.listResources(
      undefined,
      { timeout: REQUEST_TIMEOUT_MS }
    );
    const mcpResources = resourcesResult.resources.map((resource) => ({
      name: resource.name,
      description: resource.description,
      uri: resource.uri,
    }));
    return mcpResources;
  } catch (err) {
    console.error("[MCP] Failed to get resources:", err);
    throw err;
  }
};

export const getResource = async (client: Client, getResource: string) => {
  try {
    const resourceResult = await client.readResource(
      { uri: getResource },
      { timeout: REQUEST_TIMEOUT_MS }
    );
    const mcpResource = {
      contents: resourceResult.contents,
    };

    return mcpResource;
  } catch (err) {
    console.error("[MCP] Failed to get resource:", getResource, err);
    throw err;
  }
};
