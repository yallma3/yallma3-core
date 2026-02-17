import type WebSocket from "ws";
import { executeFlowRuntime } from "../../Workflow/runtime";
import type { LLMSpecTool, Tool } from "../../Models/Tool";
import type { Workflow } from "../../Models/Workflow";
import {
  connectToMultipleMcpServers,
  executeMcpTool,
  normalizeTool,
} from "./McpUtils";

type WorkspaceData = {
  workflows: { id: string }[];
};

let cachedWorkspaceData: WorkspaceData | null = null;


export function setWorkspaceDataForTools(workspaceData: WorkspaceData) {
  cachedWorkspaceData = workspaceData;
}


//  Detect if WebSocket is real or mock
function isRealWebSocket(ws: WebSocket): boolean {
  return typeof (ws as unknown as Record<string, unknown>).on === 'function' &&
         typeof (ws as unknown as Record<string, unknown>).off === 'function' &&
         typeof (ws as unknown as Record<string, unknown>).ping === 'function';
}


// sendWorkflow for Real WebSocket (manual runs)
async function sendWorkflow(ws: WebSocket, workflowId: string, context?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    let timeoutId: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      ws.off("message", listener);
      clearTimeout(timeoutId);
    };

    const listener = (message: WebSocket.RawData) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === "workflow_json" && data.id === requestId) {
          cleanup();
          resolve(JSON.stringify(data.data));
        }
        if (data.type === "error" && data.requestId === requestId) {
           cleanup();
           reject(data.message || "Workflow execution failed");
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.on("message", listener);

    ws.send(
      JSON.stringify({
        id: requestId,
        type: "run_workflow",
        requestId,
        data: workflowId,
        context: context,
        timestamp: new Date().toISOString(),
      })
    );

    timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error("Workflow execution timed out"));
    }, 60000);
  });
}


export async function workflowExecutor(
  ws: WebSocket,
  workflowId: string,
  input?: string,
) {
  //  SMART DETECTION
 
  if (isRealWebSocket(ws)) {
    //  Manual Run: Use sendWorkflow (sends via WebSocket to server)
    console.log(`[ToolCalling] Using sendWorkflow for ${workflowId} (Real WebSocket)`);
   
    const workflowResponse = await sendWorkflow(ws, workflowId, input);
    const wrapper = typeof workflowResponse === "string" ? JSON.parse(workflowResponse) : workflowResponse;
   
    const json: Workflow = typeof wrapper?.data === "string"
      ? JSON.parse(wrapper.data)
      : wrapper?.data ?? wrapper;
   
    const result = await executeFlowRuntime(json, ws, input);
    
    // Handle error case
    if (result instanceof Error) {
      console.error(`[ToolCalling] Workflow execution failed for ${workflowId}:`, result);
      throw result;
    }
    
    // Check for finalResult property
    if (result && typeof result === 'object' && 'finalResult' in result) {
      return (result as { finalResult: unknown }).finalResult;
    }
    
    // Return result directly if no finalResult
    return result;
   
  } else {
    // Triggered execution path
    if (!cachedWorkspaceData || !cachedWorkspaceData.workflows) {
      throw new Error("Workspace data not available for workflow execution");
    }
   
    const workflow = cachedWorkspaceData.workflows.find((w) => w.id === workflowId);
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    
    const result = await executeFlowRuntime(workflow as Workflow, ws, input);
   
    // Handle error case
    if (result instanceof Error) {
      console.error(`[ToolCalling] Workflow execution failed for ${workflowId}:`, result);
      throw result;
    }
   
    // Check for finalResult property
    if (result && typeof result === 'object' && 'finalResult' in result) {
      return result.finalResult;
    }
   
    return result;
  }
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
