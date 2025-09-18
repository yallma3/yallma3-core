import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { handleRunWorkspace } from "../Utils/Runtime";

export function setupWebSocketServer(wss: WebSocketServer) {
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    console.log("New WebSocket connection established:", req.socket.remoteAddress);
    clients.add(ws);

    // Handle incoming messages from frontend
    ws.on("message", (message: WebSocket.RawData) => {
      try {
        console.log("Client Count:", clients.size)
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
                  data:  "Starting workspace runtime",
                  timestamp: new Date().toISOString(),
                })
              );

            handleRunWorkspace(data.data, "basic_agent", ws);
              break;
          case "command_response":
            console.log("Command response:", data.payload);
            break;
          case "command_status_update":
            console.log("Command status update:", data.payload);
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
