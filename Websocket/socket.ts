import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { handleRunWorkspace } from "../Utils/Runtime";
import { executeFlowRuntime } from "../Workflow/runtime";
import { ConsoleInputUtils } from "../Workflow/Nodes/ConsoleInput.ts";
export let globalBroadcast: ((message: unknown) => void) | null = null;
export function setupWebSocketServer(wss: WebSocketServer) {
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    console.log(
      "New WebSocket connection established:",
      req.socket.remoteAddress
    );
    clients.add(ws);

    // Handle incoming messages from frontend
    ws.on("message", async (message: WebSocket.RawData) => {
      try {
        console.log("Client Count:", clients.size);
        const data = JSON.parse(message.toString());
        // console.log("Received message from yaLLMa3 Studio:", data);

        switch (data.type) {
          case "ping":
            ws.send(
              JSON.stringify({
                type: "pong",
                timestamp: new Date().toISOString(),
              })
            );
            break;
          case "run_workspace":
            ws.send(
              JSON.stringify({
                type: "message",
                data: "Starting workspace runtime",
                timestamp: new Date().toISOString(),
              })
            );

            handleRunWorkspace(data.data, "yallma3-gen-seq", ws);
            break;
          case "run_workflow":
            ws.send(
              JSON.stringify({
                type: "message",
                data: "Starting workflow runtime",
                timestamp: new Date().toISOString(),
              })
            );
            const workflow = JSON.parse(data.data);
            const result = await executeFlowRuntime(workflow);
            ws.send(
              JSON.stringify({
                id: workflow.id,
                type: "workflow_result",
                data: result,
                timestamp: new Date().toISOString(),
              })
            );
            // console.log("Workflow  result:", result);

            break;
          case "workflow_json":
            // console.log(data.data);
            break;
          case "command_response":
            console.log("Command response:", data.payload);
            break;
          case "command_status_update":
            console.log("Command status update:", data.payload);
            break;
          case "console_input":
            console.log("Received console input:", data.data);
            if (data.data && typeof data.data === "object") {
              const event = data.data;
              ConsoleInputUtils.addEvent(event);
            }

            // Broadcast to all clients
            broadcast({
              type: "console_input",
              data: data.data,
              timestamp: new Date().toISOString(),
            });
            break;

          default:
            console.log("Unknown message type:", data.type);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Invalid message format",
            timestamp: new Date().toISOString(),
          })
        );
      }
    });

    ws.on("close", () => {
      console.log("WebSocket connection closed");
      clients.delete(ws);
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      clients.delete(ws);
    });

    // Send initial confirmation
    ws.send(
      JSON.stringify({
        type: "connected",
        message: "Connected to yaLLMa3API WebSocket server",
        timestamp: new Date().toISOString(),
      })
    );
  });

  // Broadcast to all connected clients
  function broadcast(message: unknown) {
    const messageStr = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  // Send to a single client
  function sendToClient(ws: WebSocket, message: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // Broadcast a command
  function broadcastCommand(commandData: {
    id: string;
    command: string;
    data?: unknown;
  }) {
    const message = {
      type: "execute_command",
      commandId: commandData.id,
      command: commandData.command,
      data: commandData.data,
      timestamp: new Date().toISOString(),
    };
    broadcast(message);
    console.log(
      `Broadcasted command ${commandData.id} to ${clients.size} clients`
    );
  }

  return {
    broadcast,
    sendToClient,
    broadcastCommand,
    getClientCount: () => clients.size,
  };
}
