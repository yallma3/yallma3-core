import { WebSocket } from "ws";
import { getMainAgent } from "../Agent/Main/MainAgentRegistry";
import { setWorkspaceDataForTools } from "../Agent/Utls/ToolCallingHelper";

export function createMainAgent(data: string, ws: WebSocket) {
  try {
    const workspaceData = JSON.parse(data);
    setWorkspaceDataForTools(workspaceData);  
    const agent = getMainAgent("1.0.0", workspaceData, ws);
    return agent;
  } catch (error) {
    throw new Error(
      `Invalid workspace data: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
