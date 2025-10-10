import { BasicAgentRuntime, yallma3GenSeqential } from "../Agent/MainAgents";
import { WebSocket } from "ws";

/**
 * Dispatches a JSON-encoded workspace payload to the appropriate agent runtime and forwards responses over the WebSocket.
 *
 * Parses `data` as JSON and invokes the runtime for `agentType` ("basic_agent" or "yallma3-gen-seq"); if `agentType` is unrecognized, sends an informational message over `ws`.
 *
 * @param data - JSON string containing the workspace payload to be processed by the agent runtime
 * @param agentType - Identifier of the agent runtime to use; defaults to `"basic_agent"`
 */
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