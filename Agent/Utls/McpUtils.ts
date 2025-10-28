import type { ServerConfig } from "../../Models/Mcp";
import type { Tool } from "../../Models/Tool";
import { McpHttpClient } from "../../Utils/McpHttpClient";
import { McpSTDIOClient } from "../../Utils/McpStdioClient";

// Store active MCP clients for tool execution
const mcpClients = new Map<string, McpSTDIOClient | McpHttpClient>();

export const connectToMcpTools = async (mcpTool: Tool) => {
  try {
    const mcpConfig = mcpTool.parameters;

    let tools: unknown = [];
    let client: McpSTDIOClient | McpHttpClient;

    // Default to STDIO if type is not specified but command/args are present
    const connectionType =
      mcpConfig.type || (mcpConfig.command ? "STDIO" : "HTTP");

    if (connectionType === "STDIO") {
      console.log("STDIO");
      const serverConfig: ServerConfig = {
        command: mcpConfig.command,
        args: mcpConfig.args,
      };
      client = new McpSTDIOClient(serverConfig);
      await client.init();
      tools = await client.listTools();
    } else if (connectionType === "HTTP") {
      console.log("HTTP");
      const serverUrl = mcpConfig.url;
      client = new McpHttpClient(serverUrl);
      await client.init();
      tools = await client.listTools();
    }

    // Store the client for later tool execution
    if (client! && mcpTool.name) {
      mcpClients.set(mcpTool.name, client);
    }

    return tools;
  } catch (error) {
    console.error("Error listing tools from MCP server:", error);
    return null;
  }
};

export const connectToMultipleMcpServers = async (mcpTools: Tool[]) => {
  const allMcpTools: any[] = [];

  for (const mcpTool of mcpTools) {
    try {
      const tools = await connectToMcpTools(mcpTool);
      if (tools && Array.isArray(tools)) {
        // Add server info to each tool for execution routing
        const toolsWithServer = tools.map((tool: any) => ({
          ...tool,
          serverName: mcpTool.name,
          serverId: mcpTool.id || mcpTool.name,
        }));
        allMcpTools.push(...toolsWithServer);
      }
    } catch (error) {
      console.error(`Error connecting to MCP server ${mcpTool.name}:`, error);
    }
  }

  return allMcpTools;
};

export const executeMcpTool = async (
  serverName: string,
  toolName: string,
  args: Record<string, any>
) => {
  console.log("CALLING MCP TOOL", toolName);
  try {
    const client = mcpClients.get(serverName);
    if (!client) {
      throw new Error(`MCP client not found for server: ${serverName}`);
    }

    const result = await client.callTool({
      tool: toolName,
      input: args,
    });

    console.log("MCP TOOL RESULT", result);

    return result;
  } catch (error) {
    console.error(
      `Error executing MCP tool ${toolName} on server ${serverName}:`,
      error
    );
    throw error;
  }
};

export const closeMcpConnections = async () => {
  for (const [serverName, client] of mcpClients.entries()) {
    try {
      await client.close();
      console.log(`Closed MCP connection for server: ${serverName}`);
    } catch (error) {
      console.error(
        `Error closing MCP connection for server ${serverName}:`,
        error
      );
    }
  }
  mcpClients.clear();
};

export function normalizeTool(tool: any) {
  function cleanSchema(schema: any): any {
    if (Array.isArray(schema)) return schema.slice(); // ✅ preserve arrays
    if (typeof schema !== "object" || schema === null) return schema;

    const allowedKeys = ["type", "properties", "required", "items"];
    const result: any = {};

    for (const key of allowedKeys) {
      if (key in schema) {
        if (key === "properties") {
          result.properties = {};
          for (const [prop, value] of Object.entries(schema.properties)) {
            result.properties[prop] = cleanSchema(value);
          }
        } else {
          result[key] = cleanSchema(schema[key]);
        }
      }
    }

    if (schema.type && typeof schema.type === "string") {
      result.type = schema.type;
    }

    return result;
  }

  return {
    name: tool.name,
    description: tool.description,
    inputSchema: cleanSchema(tool.inputSchema || {}),
  };
}
