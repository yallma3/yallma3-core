import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { getTools, callTool, getPrompts, getPrompt, getResources, getResource } from "./Mcp";
import { type ToolCall } from "../Models/Mcp"


const getHTTPClient = async (serverUrl: string) => {
    const url = new URL(serverUrl);

    try {
      const client = new Client({
            name: "http-client",
            version: "1.0.0",
          });

      let transport: StreamableHTTPClientTransport | SSEClientTransport;

      try {
        transport = new StreamableHTTPClientTransport(url);
        await client.connect(transport);
      } catch (err) {
        const sseTransport = new SSEClientTransport(url);
        try {
          await client.connect(sseTransport);
        } catch (err) {
          throw err;
        }
      }

      return client;
    } catch (err) {
      throw err;
    }
}

export const httpListTools = async(serverUrl: string) => {
  try{
    const client = await getHTTPClient(serverUrl)

    const response = await getTools(client)
    await client.close();

    return response;
  } catch (err) {
      throw err;
  }
}

export const httpToolCall = async(serverUrl: string, toolCall: ToolCall) => {
    try {
      const client = await  getHTTPClient(serverUrl);

      const response = await callTool(client, toolCall);
      await client.close();

      return response;
    } catch (err) {
      throw err;
    }
}

export const httpListPrompts = async(serverUrl: string) => {
  try{
    const client = await getHTTPClient(serverUrl)

    const response = await getPrompts(client)
    await client.close();

    return response;
  } catch (err) {
      throw err;
  }
}

export const httpGetPrompt = async(serverUrl: string, prompt: string) => {
    try {
      const client = await  getHTTPClient(serverUrl);

      const response = await getPrompt(client, prompt);
      await client.close();

      return response;
    } catch (err) {
      throw err;
    }
}

export const httpListResources = async(serverUrl: string) => {
  try{
    const client = await getHTTPClient(serverUrl)

    const response = await getResources(client)
    await client.close();

    return response;
  } catch (err) {
      throw err;
  }
}

export const httpGetResource = async(serverUrl: string, resource: string) => {
    try {
      const client = await  getHTTPClient(serverUrl);

      const response = await getResource(client, resource);
      await client.close();

      return response;
    } catch (err) {
      throw err;
    }
}



