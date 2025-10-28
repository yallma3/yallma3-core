import type WebSocket from "ws";
import { sendWorkflow } from "../MainAgents";
import type { Workflow } from "../../Models/Workflow";
import { executeFlowRuntime } from "../../Workflow/runtime";
import type { LLMSpecTool, Tool } from "../../Models/Tool";
import {
  connectToMultipleMcpServers,
  executeMcpTool,
  normalizeTool,
} from "./McpUtils";

export async function workflowExecutor(
  ws: WebSocket,
  workflowId: string,
  input?: any
) {
  const workflow = await sendWorkflow(ws, workflowId);
  const wrapper = await JSON.parse(workflow);

  // If workflow is already an object (not string), guard against double-parse
  const json: Workflow =
    typeof wrapper.data === "string" ? JSON.parse(wrapper.data) : wrapper.data;

  const result = await executeFlowRuntime(json, ws, input);

  return (result as any).finalResult;
}

export const toolExecutorAttacher = async (ws: WebSocket, tools: Tool[]) => {
  let attachedTools: LLMSpecTool[] = [];

  // Handle MCP tools separately
  const mcpTools = tools.filter((tool) => tool.type === "mcp");
  const otherTools = tools.filter((tool) => tool.type !== "mcp");

  // Connect to MCP servers and get their tools
  if (mcpTools.length > 0) {
    const mcpServerTools = await connectToMultipleMcpServers(mcpTools);

    // Convert MCP tools to LLMSpecTool format
    for (const mcpTool of mcpServerTools) {
      const normalizedTool = normalizeTool(mcpTool);

      const llmTool: LLMSpecTool = {
        type: "function",
        name: normalizedTool.name,
        description: normalizedTool.description || "",
        parameters: normalizedTool.inputSchema || {
          type: "object",
          properties: {},
          additionalProperties: true,
        },
        executor: async (args: Record<string, any>) => {
          try {
            const result = await executeMcpTool(
              mcpTool.serverName,
              normalizedTool.name,
              args
            );
            return result;
          } catch (error) {
            console.error(
              `Error executing MCP tool ${normalizedTool.name}:`,
              error
            );
            throw error;
          }
        },
      };
      attachedTools.push(llmTool);
    }
  }

  // Handle other tool types
  otherTools.map((tool) => {
    if (tool.type == "workflow") {
      const workflowID = tool.parameters["workflowId"];
      const workflowTool: LLMSpecTool = {
        type: "function",
        name: tool.name,
        description: tool.description || "",
        parameters: {
          type: "object",
          properties: {
            workflowInput: { type: "string" },
          },
          required: ["workflowInput"],
        },
        executor: async ({ workflowInput }: { workflowInput: string }) => {
          const result = await workflowExecutor(ws, workflowID, workflowInput);
          return result;
        },
      };

      attachedTools.push(workflowTool);
    }
  });

  return attachedTools;
};
