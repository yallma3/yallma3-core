import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getTools, callTool, getPrompts, getPrompt, getResources, getResource } from "./Mcp";
import { type ToolCall, type ServerConfig } from "../Models/Mcp"

const getSTDIOPClient = async (serverConfig: ServerConfig) => {
    try {
      const client = new Client({
            name: "stdio-client",
            version: "1.0.0",
          });

        const transport = new StdioClientTransport({
            command: serverConfig.command,
            args: serverConfig.args || [],
        });

        await client.connect(transport);

      return client;
    } catch (err) {
      throw err;
    }
}

export const stdioListTools = async(serverConfig: ServerConfig) => {
  try{
    const client = await getSTDIOPClient(serverConfig)

    const response = await getTools(client)
    await client.close();

    return response;
  } catch (err) {
      throw err;
  }
}

export const stdioToolCall = async(serverConfig: ServerConfig, toolCall: ToolCall) => {
    try {
      const client = await  getSTDIOPClient(serverConfig);

      const response = await callTool(client, toolCall);
      await client.close();

      return response;
    } catch (err) {
      throw err;
    }
}

export const stdioListPrompts = async(serverConfig: ServerConfig) => {
  try{
    const client = await getSTDIOPClient(serverConfig)

    const response = await getPrompts(client)
    await client.close();

    return response;
  } catch (err) {
      throw err;
  }
}

export const stdioGetPrompt = async(serverConfig: ServerConfig, prompt: string) => {
    try {
      const client = await  getSTDIOPClient(serverConfig);

      const response = await getPrompt(client, prompt);
      await client.close();

      return response;
    } catch (err) {
      throw err;
    }
}

export const stdioListResources = async(serverConfig: ServerConfig) => {
  try{
    const client = await getSTDIOPClient(serverConfig)

    const response = await getResources(client)
    await client.close();

    return response;
  } catch (err) {
      throw err;
  }
}

export const stdioGetResource = async(serverConfig: ServerConfig, resource: string) => {
    try {
      const client = await  getSTDIOPClient(serverConfig);

      const response = await getResource(client, resource);
      await client.close();

      return response;
    } catch (err) {
      throw err;
    }
}



