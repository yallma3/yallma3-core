import type WebSocket from "ws";
import { sendWorkflow } from "../MainAgents";
import type { Workflow } from "../../Models/Workflow";
import { executeFlowRuntime } from "../../Workflow/runtime";
import type { LLMSpecTool, Tool } from "../../Models/Tool";

export async function workflowExecutor(
  ws: WebSocket,
  workflowId: string,
  input?: any
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

  return (result as any).finalResult;
}

export const toolExecutorAttacher = async (ws: WebSocket, tools: Tool[]) => {
  let attachedTools: LLMSpecTool[] = [];

  tools.map((tool) => {
    if (tool.type == "workflow") {
      const workflowTool: LLMSpecTool = {
        type: "function",
        name: tool.name,
        description: tool.description || "",
        parameters: {
          type: "object",
          properties: {
            workflowId: { type: "string" },
            workflowInput: { type: "string" },
          },
          required: ["workflowId", "workflowInput"],
        },
        executor: async ({
          workflowId,
          workflowInput,
        }: {
          workflowId: string;
          workflowInput: string;
        }) => {
          const result = await workflowExecutor(ws, workflowId, workflowInput);
          return result;
        },
      };

      attachedTools.push(workflowTool);
    }
  });

  return attachedTools;
};
