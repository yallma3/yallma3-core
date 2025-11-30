import { WebSocket } from "ws";
import { getMainAgent } from "../Agent/Main/MainAgentRegistry";

export function createMainAgent(data: string, ws: WebSocket) {
  const workspaceData = JSON.parse(data);
  const agent = getMainAgent("1.0.0", workspaceData, ws);
  return agent;
}
