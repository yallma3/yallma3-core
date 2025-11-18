import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { setupWebSocketServer } from "../../../Websocket/socket";
import { ConsoleInputUtils, registerPrompt } from "../../../Workflow/Nodes/ConsoleInput";

describe("WebSocket Server", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let wss: any;

  beforeAll(() => {
    // Create a test WebSocket server
    wss = new WebSocketServer({ port: 0 }); // Random port
    setupWebSocketServer(wss);
  });

  beforeEach(() => {
    // Clear console events and prompts before each test
    ConsoleInputUtils.clearEvents();
    // Clean up all prompts
    const pending = ConsoleInputUtils.getPendingPrompts();
    pending.forEach(p => {
      if (p) {
        ConsoleInputUtils.resolvePrompt(p.promptId, 'cleanup');
      }
    });
    ConsoleInputUtils.cleanupPrompts(0);
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
      const promptId = 'test_prompt_123';

      registerPrompt(promptId, 1);

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
              // Both clients connected, now send console input from ws1
              ws1.send(JSON.stringify({
                type: 'console_input',
                data: { 
                  promptId: promptId,
                  message: 'test input',
                  type: 'input',
                  details: 'User input'
                }
              }));
            }
          } else if (message.type === 'console_input_resolved') {
            expect(message.data.promptId).toBe(promptId);
            expect(message.data.message).toBe('test input');
            checkComplete();
          }
        });
      };

      setupMessageListener(ws1);
      setupMessageListener(ws2);

      // Timeout after 5 seconds
      setTimeout(() => {
        ws1.close();
        ws2.close();
        reject(new Error('Test timed out - received ' + receivedCount + ' messages, expected 2'));
      }, 5000);
    });
  });

  it("should reject console input without promptId", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let connectedReceived = false;

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'connected') {
          connectedReceived = true;
          // Send console input without promptId
          ws.send(JSON.stringify({
            type: 'console_input',
            data: { 
              message: 'test input',
              type: 'input'
            }
          }));
        } else if (message.type === 'error' && connectedReceived) {
          expect(message.message).toContain('missing promptId or message');
          ws.close();
          resolve();
        }
      });

      setTimeout(() => {
        reject(new Error('Test timed out waiting for error message'));
      }, 5000);
    });
  });

  it("should reject console input for non-existent prompt", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let connectedReceived = false;

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'connected') {
          connectedReceived = true;
          // Send console input for non-existent prompt
          ws.send(JSON.stringify({
            type: 'console_input',
            data: { 
              promptId: 'non_existent_prompt',
              message: 'test input',
              type: 'input'
            }
          }));
        } else if (message.type === 'error' && connectedReceived) {
          expect(message.message).toContain('not found or already resolved');
          expect(message.promptId).toBe('non_existent_prompt');
          ws.close();
          resolve();
        }
      });

      setTimeout(() => {
        reject(new Error('Test timed out waiting for error message'));
      }, 5000);
    });
  });

  it("should handle get_pending_prompts request", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let connectedReceived = false;

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'connected') {
          connectedReceived = true;
          // Request pending prompts
          ws.send(JSON.stringify({
            type: 'get_pending_prompts'
          }));
        } else if (message.type === 'pending_prompts' && connectedReceived) {
          expect(message.data).toBeInstanceOf(Array);
          ws.close();
          resolve();
        }
      });

      setTimeout(() => {
        reject(new Error('Test timed out waiting for pending_prompts response'));
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

  it("should handle multiple clients with separate prompts", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws1 = new WebSocket(`ws://localhost:${port}`);
      const ws2 = new WebSocket(`ws://localhost:${port}`);

      let connectedCount = 0;
      const promptId1 = 'prompt_client1';
      const promptId2 = 'prompt_client2';
      const resolvedPrompts = new Set<string>();

      // Register both prompts before attempting to resolve them
      registerPrompt(promptId1, 1);
      registerPrompt(promptId2, 2);

      const checkComplete = (promptId: string) => {
        resolvedPrompts.add(promptId);
        if (resolvedPrompts.size === 2) {
          ws1.close();
          ws2.close();
          resolve();
        }
      };

      // Both clients should listen for both resolved prompts (broadcast goes to all)
      const setupMessageListener = (ws: WebSocket, clientNum: number) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'connected') {
            connectedCount++;
            if (connectedCount === 2) {
              // Both clients connected, send both inputs
              ws1.send(JSON.stringify({
                type: 'console_input',
                data: { 
                  promptId: promptId1,
                  message: 'input from client 1',
                  type: 'input',
                  details: 'User input'
                }
              }));
              
              // Send second input with a slight delay to avoid race conditions
              setTimeout(() => {
                ws2.send(JSON.stringify({
                  type: 'console_input',
                  data: { 
                    promptId: promptId2,
                    message: 'input from client 2',
                    type: 'input',
                    details: 'User input'
                  }
                }));
              }, 100);
            }
          } else if (message.type === 'console_input_resolved') {
            // Both clients receive all broadcasts
            if (message.data.promptId === promptId1) {
              expect(message.data.message).toBe('input from client 1');
              checkComplete(promptId1);
            } else if (message.data.promptId === promptId2) {
              expect(message.data.message).toBe('input from client 2');
              checkComplete(promptId2);
            }
          }
        });
      };

      setupMessageListener(ws1, 1);
      setupMessageListener(ws2, 2);

      setTimeout(() => {
        ws1.close();
        ws2.close();
        reject(new Error('Test timed out - resolved ' + resolvedPrompts.size + ' prompts, expected 2'));
      }, 5000);
    });
  });
});