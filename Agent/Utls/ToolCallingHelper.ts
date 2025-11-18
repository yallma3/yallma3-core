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
  input?: string
) {
  const workflow = await sendWorkflow(ws, workflowId);
  const wrapper: any =
    typeof workflow === "string" ? JSON.parse(workflow) : workflow;

  // If workflow is already an object (not string), guard against double-parse
  const json: Workflow =
    typeof wrapper?.data === "string"
      ? JSON.parse(wrapper.data)
      : wrapper?.data ?? wrapper;

  const result = await executeFlowRuntime(json, ws, input);

  return (result as { finalResult: unknown }).finalResult;
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
      const normalizedTool = normalizeTool(mcpTool) as { name: string; description: string; inputSchema: unknown };

      const llmTool: LLMSpecTool = {
        type: "function",
        name: normalizedTool.name as string,
        description: (normalizedTool.description as string) || "",
        parameters: (normalizedTool.inputSchema as Record<string, unknown>) || {
          type: "object",
          properties: {},
          additionalProperties: true,
        },
        executor: async (args: Record<string, unknown>) => {
          try {
            const result = await executeMcpTool(
              (mcpTool as Record<string, unknown>).serverName as string,
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
      const workflowID = tool.parameters["workflowId"] as string;
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
        executor: async (args: Record<string, unknown>) => {
          const workflowInput = args.workflowInput as string;
          const result = await workflowExecutor(ws, workflowID, workflowInput);
          return result;
        },
      };

      attachedTools.push(workflowTool);
    }
  });

  return attachedTools;
};
