import { WebSocket } from "ws";
import { getMainAgent } from "../Agent/Main/MainAgentRegistry";

export async function handleRunWorkspace(data: string, ws: WebSocket) {
  const workspaceData = JSON.parse(data);

  // const agent = getMainAgent(workspaceData.mainAgentVersion);
  const agent = getMainAgent("1.0.0", workspaceData, ws);
  await agent.run();
}
