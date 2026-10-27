import { executeFlowRuntime } from "../../Workflow/runtime";
import type { LLMSpecTool, Tool } from "../../Models/Tool";
import type { Workflow } from "../../Models/Workflow";
import type { ExecutionTracer } from "../../Execution/ExecutionTracer";
import {
  connectToMultipleMcpServers,
  executeMcpTool,
  normalizeTool,
} from "./McpUtils";
import { WorkspaceRepository } from "../../Execution/WorkspaceRepository";
import type { ExecutionContext } from "../../Execution/ExecutionContext";


async function triggeredPath(
  ctx: ExecutionContext,
  workflowId: string,
  input?: string,
  triggerData?: unknown,
  broadcast?: (data: unknown) => void,
  tracer?: ExecutionTracer,
): Promise<unknown> {
  const repo = WorkspaceRepository.getInstance();
  const currentId = repo.getCurrent();
  const wsData = currentId ? repo.get(currentId) : undefined;
  if (!wsData || !wsData.workflows) {
    throw new Error("Workspace data not available for workflow execution");
  }

  const workflow = wsData.workflows.find((w: Workflow) => w.id === workflowId);

  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const result = await executeFlowRuntime(workflow, ctx, input, triggerData, broadcast, tracer);

  if (result instanceof Error) {
    console.error(`[ToolCalling] Workflow execution failed for ${workflowId}:`, result);
    throw result;
  }

  if (result && typeof result === 'object' && 'finalResult' in result) {
    return result.finalResult;
  }

  return result;
}

export async function workflowExecutor(
  ctx: ExecutionContext,
  workflowId: string,
  input?: string,
  triggerData?: unknown,
  broadcast?: (data: unknown) => void,
  tracer?: ExecutionTracer,
): Promise<{ status: "completed" | "failed"; reason?: string; result?: unknown }> {
  const b = broadcast ?? ctx?.broadcast?.bind(ctx);
  try {
    const result = await triggeredPath(ctx, workflowId, input, triggerData, b, tracer);
    return { status: "completed", result };
  } catch (err) {
    return {
      status: "failed",
      reason:
        err instanceof Error ? err.message : String(err),
    };
  }
}

export const toolExecutorAttacher = async (ctx: ExecutionContext, tools: Tool[]): Promise<LLMSpecTool[]> => {
  let attachedTools: LLMSpecTool[] = [];

  // Handle MCP tools separately
  const mcpTools = tools.filter((tool) => tool.type === "mcp");
  const otherTools = tools.filter((tool) => tool.type !== "mcp");

  // Connect to MCP servers and get their tools
  if (mcpTools.length > 0) {
    const mcpServerTools = await connectToMultipleMcpServers(mcpTools);

    // Convert MCP tools to LLMSpecTool format
    for (const mcpTool of mcpServerTools) {
      const normalizedTool = normalizeTool(mcpTool) as {
        name: string;
        description: string;
        inputSchema: unknown;
      };

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
  for (const tool of otherTools) {
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
          const result = await workflowExecutor(ctx, workflowID, workflowInput);
          return result.result ?? result;
        },
      };

      attachedTools.push(workflowTool);
    }
  }

  return attachedTools;
};