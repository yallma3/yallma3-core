import { BasicAgentRuntime, yallma3GenSeqential } from "../Agent/MainAgents";
import { WebSocket } from "ws";

export async function handleRunWorkspace(
  data: string,
  agentType: string = "basic_agent",
  ws: WebSocket
) {
  const workspaceData = JSON.parse(data);

  switch (agentType) {
    case "basic_agent":
      await BasicAgentRuntime(workspaceData, ws);
      break;
    case "yallma3-gen-seq":
      await yallma3GenSeqential(workspaceData, ws);
      break;
    default:
      ws.send(
        JSON.stringify({
          type: "message",
          data: "No Agent Handler for Agent Type: " + agentType,
          timestamp: new Date().toISOString(),
        })
      );
  }

  // ws.send(
  //   JSON.stringify({
  //     type: "message",
  //     data:  "From runtime handler",
  //     timestamp: new Date().toISOString(),
  //     })
  // );
}
