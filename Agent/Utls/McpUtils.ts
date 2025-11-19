import type { ServerConfig } from "../../Models/Mcp";
import type { Tool } from "../../Models/Tool";
import { McpHttpClient } from "../../Utils/McpHttpClient";
import { McpSTDIOClient } from "../../Utils/McpStdioClient";

interface McpConfig {
  type?: string;
  command?: string;
  args?: string[];
  url?: string;
}

// Store active MCP clients for tool execution
const mcpClients = new Map<string, McpSTDIOClient | McpHttpClient>();

export const connectToMcpTools = async (mcpTool: Tool) => {
  try {
    const mcpConfig = mcpTool.parameters as McpConfig;

    let tools: unknown = [];
    let client: McpSTDIOClient | McpHttpClient;

    // Default to STDIO if type is not specified but command/args are present
    const connectionType =
      mcpConfig.type || (mcpConfig.command ? "STDIO" : "HTTP");

    if (connectionType === "STDIO") {
      console.log("STDIO");
      const serverConfig: ServerConfig = {
        command: mcpConfig.command as string,
        args: mcpConfig.args,
      };
      client = new McpSTDIOClient(serverConfig);
      await client.init();
      tools = await client.listTools();
    } else if (connectionType === "HTTP") {
      console.log("HTTP");
      const serverUrl = mcpConfig.url as string;
      client = new McpHttpClient(serverUrl);
      await client.init();
      tools = await client.listTools();
    } else {
      console.error(`Unsupported MCP connection type: ${connectionType}`);
      return null;
    }

    // Store the client for later tool execution
    if (client && mcpTool.name) {
      mcpClients.set(mcpTool.name, client);
    }

    return tools;
  } catch (error) {
    console.error("Error listing tools from MCP server:", error);
    return null;
  }
};

export const connectToMultipleMcpServers = async (mcpTools: Tool[]) => {
  const allMcpTools: unknown[] = [];

  for (const mcpTool of mcpTools) {
    try {
      const tools = await connectToMcpTools(mcpTool);
      if (tools && Array.isArray(tools)) {
        // Add server info to each tool for execution routing
        const toolsWithServer = tools.map((tool: unknown) => ({
          ...(tool as Record<string, unknown>),
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
  args: Record<string, unknown>
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

export function normalizeTool(tool: unknown) {
  const t = tool as Record<string, unknown>;
  function cleanSchema(schema: unknown): unknown {
    if (Array.isArray(schema)) return schema.slice(); // ✅ preserve arrays
    if (typeof schema !== "object" || schema === null) return schema;

    const s = schema as Record<string, unknown>;
    const allowedKeys = ["type", "properties", "required", "items"];
    const result: Record<string, unknown> = {};

    for (const key of allowedKeys) {
      if (key in s) {
        if (key === "properties") {
          result.properties = {};
          const props = s.properties as Record<string, unknown>;
          for (const [prop, value] of Object.entries(props)) {
            (result.properties as Record<string, unknown>)[prop] =
              cleanSchema(value);
          }
        } else {
          result[key] = cleanSchema(s[key]);
        }
      }
    }

    if (s.type && typeof s.type === "string") {
      result.type = s.type;
    }

    return result;
  }

  return {
    name: t.name,
    description: t.description,
    inputSchema: cleanSchema(t.inputSchema || {}),
  };
}
