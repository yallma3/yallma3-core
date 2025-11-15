import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { setupWebSocketServer } from "../../../Websocket/socket";

describe("WebSocket Server", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let wss: any;

  beforeAll(() => {
    // Create a test WebSocket server
    wss = new WebSocketServer({ port: 0 }); // Random port
    setupWebSocketServer(wss);
  });

  afterAll(() => {
    wss.close();
  });

  it("should handle ping-pong messages", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let connectedReceived = false;

      ws.on('open', () => {
        // Send ping
        ws.send(JSON.stringify({ type: 'ping' }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'connected') {
          connectedReceived = true;
        } else if (message.type === 'pong' && connectedReceived) {
          expect(message).toHaveProperty('timestamp');
          ws.close();
          resolve();
        }
      });
    });
  });

  it("should send connected message on connection", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString()) as { type: string; message: string };
        expect(message.type).toBe('connected');
        expect(message.message).toBe('Connected to yaLLMa3API WebSocket server');
        ws.close();
        resolve();
      });
    });
  });

  it("should handle console input messages", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws1 = new WebSocket(`ws://localhost:${port}`);
      const ws2 = new WebSocket(`ws://localhost:${port}`);

      let receivedCount = 0;
      let connectedCount = 0;

      const checkComplete = () => {
        receivedCount++;
        if (receivedCount === 2) {
          ws1.close();
          ws2.close();
          resolve();
        }
      };

      // Set up message listeners for both clients
      const setupMessageListener = (ws: WebSocket) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'connected') {
            connectedCount++;
            if (connectedCount === 2) {
              // Both clients connected, now send the message from ws1
              ws1.send(JSON.stringify({
                type: 'console_input',
                data: { message: 'test input', type: 'user' }
              }));
            }
          } else if (message.type === 'console_input') {
            expect(message.data.message).toBe('test input');
            checkComplete();
          }
        });
      };

      setupMessageListener(ws1);
      setupMessageListener(ws2);

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Test timed out - received ' + receivedCount + ' messages, expected 2'));
      }, 5000);
    });
  });

  it("should handle unknown message types gracefully", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'unknown_type', data: 'test' }));
      });

      // If no error message is sent, the test passes
      setTimeout(() => {
        ws.close();
        resolve();
      }, 100);
    });
  });

  it("should handle invalid JSON gracefully", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let connectedReceived = false;

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'connected') {
          connectedReceived = true;
          // Now send invalid JSON after receiving connected message
          ws.send('invalid json');
        } else if (message.type === 'error' && connectedReceived) {
          expect(message.message).toBe('Invalid message format');
          ws.close();
          resolve();
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Test timed out waiting for error message'));
      }, 5000);
    });
  });
});