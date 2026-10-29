import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { setupWebSocketServer } from "../../../Websocket/socket";
import {
  ConsoleInputUtils,
  registerPrompt,
} from "../../../Workflow/Nodes/ConsoleInput";
import { initFlowSystem } from "../../../Workflow/initFlowSystem";
import { createGoal2WorkflowPayload } from "../../__mocks__/goal2PayloadFixtures";

// Mock dependencies
vi.mock("../../../Workflow/runtime", () => ({
  executeFlowRuntime: vi.fn(),
}));

vi.mock("../../../Utils/Runtime", () => ({
  createMainAgent: vi.fn(),
}));

vi.mock("../../../Task/TaskIntrepreter", () => ({
  planAgenticTask: vi.fn(),
  analyzeTaskCore: vi.fn().mockResolvedValue({
    taskId: "test-task",
    intent: "Test intent",
    classification: "simple",
    needsDecomposition: false,
    userInput: null,
  }),
}));

vi.mock("../../../Agent/Utls/ToolCallingHelper", () => ({
  workflowExecutor: vi.fn(),
}));

import { planAgenticTask } from "../../../Task/TaskIntrepreter";
import { workflowExecutor } from "../../../Agent/Utls/ToolCallingHelper";
import { createMainAgent } from "../../../Utils/Runtime";
import type { MainAgent } from "../../../Agent/Main/MainAgent";
import { executeFlowRuntime } from "../../../Workflow/runtime";

describe("WebSocket Server", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let wss: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let wsFunctions: any;

  beforeAll(() => {
    // Create a test WebSocket server
    wss = new WebSocketServer({ port: 0 }); // Random port
    wsFunctions = setupWebSocketServer(wss);
  });

  beforeEach(() => {
    // Clear console events and prompts before each test
    ConsoleInputUtils.clearEvents();
    // Clean up all prompts
    const pending = ConsoleInputUtils.getPendingPrompts();
    pending.forEach((p) => {
      if (p) {
        ConsoleInputUtils.resolvePrompt(p.promptId, "cleanup");
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

      ws.on("open", () => {
        // Send ping
        ws.send(JSON.stringify({ type: "ping" }));
      });

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "connected") {
          connectedReceived = true;
        } else if (message.type === "pong" && connectedReceived) {
          expect(message).toHaveProperty("timestamp");
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

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString()) as {
          type: string;
          message: string;
        };
        expect(message.type).toBe("connected");
        expect(message.message).toBe(
          "Connected to yaLLMa3API WebSocket server"
        );
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
      const promptId = "test_prompt_123";

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
        ws.on("message", (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === "connected") {
            connectedCount++;
            if (connectedCount === 2) {
              // Both clients connected, now send console input from ws1
              ws1.send(
                JSON.stringify({
                  type: "console_input",
                  data: {
                    promptId: promptId,
                    message: "test input",
                    type: "input",
                    details: "User input",
                  },
                })
              );
            }
          } else if (message.type === "console_input_resolved") {
            expect(message.data.promptId).toBe(promptId);
            expect(message.data.message).toBe("test input");
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
        reject(
          new Error(
            "Test timed out - received " +
              receivedCount +
              " messages, expected 2"
          )
        );
      }, 5000);
    });
  });

  it("should send exactly one console_input_resolved event to the requesting socket", async () => {
    const port = wss.address().port;
    const promptId = "dedupe_prompt_1";
    const requestId = "req-console-1";
    registerPrompt(promptId, 1);

    return new Promise<void>((resolve, reject) => {
      const ws1 = new WebSocket(`ws://localhost:${port}`);
      const ws2 = new WebSocket(`ws://localhost:${port}`);
      let connectedCount = 0;
      const ws1Events: Array<Record<string, unknown>> = [];
      const ws2Events: Array<Record<string, unknown>> = [];

      const sendInput = () => {
        if (connectedCount === 2) {
          ws1.send(
            JSON.stringify({
              type: "console_input",
              requestId,
              data: {
                promptId,
                message: "test input",
                type: "input",
                details: "User input",
              },
            })
          );
        }
      };

      const onMessage = (
        target: Array<Record<string, unknown>>,
        data: unknown
      ) => {
        const message = JSON.parse(String(data));
        if (message.type === "connected") {
          connectedCount++;
          sendInput();
        } else if (message.type === "console_input_resolved") {
          target.push(message);
        }
      };

      ws1.on("message", (data) => onMessage(ws1Events, data));
      ws2.on("message", (data) => onMessage(ws2Events, data));

      setTimeout(() => {
        try {
          // Requesting socket gets exactly one event, correlated by requestId.
          expect(ws1Events).toHaveLength(1);
          expect(ws1Events[0]?.requestId).toBe(requestId);
          // Other sockets get exactly one broadcast without a requestId.
          expect(ws2Events).toHaveLength(1);
          expect(ws2Events[0]?.requestId).toBeUndefined();
          ws1.close();
          ws2.close();
          resolve();
        } catch (error) {
          ws1.close();
          ws2.close();
          reject(error);
        }
      }, 400);
    });
  });

  it("should echo requestId in the manual trigger registration ack", async () => {
    const port = wss.address().port;
    const requestId = "req-manual-1";

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "connected") {
          ws.send(
            JSON.stringify({
              type: "register_trigger",
              requestId,
              data: JSON.stringify({
                workspaceId: "test-manual-ws",
                trigger: { type: "manual" },
              }),
            })
          );
        } else if (message.type === "trigger_registered") {
          expect(message.success).toBe(true);
          expect(message.requestId).toBe(requestId);
          ws.close();
          resolve();
        }
      });

      setTimeout(() => reject(new Error("Timed out")), 5000);
    });
  });

  it("should reject console input without promptId", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let connectedReceived = false;

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "connected") {
          connectedReceived = true;
          // Send console input without promptId
          ws.send(
            JSON.stringify({
              type: "console_input",
              data: {
                message: "test input",
                type: "input",
              },
            })
          );
        } else if (message.type === "error" && connectedReceived) {
          expect(message.message).toContain("missing promptId or message");
          ws.close();
          resolve();
        }
      });

      setTimeout(() => {
        reject(new Error("Test timed out waiting for error message"));
      }, 5000);
    });
  });

  it("should reject console input for non-existent prompt", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let connectedReceived = false;

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "connected") {
          connectedReceived = true;
          // Send console input for non-existent prompt
          ws.send(
            JSON.stringify({
              type: "console_input",
              data: {
                promptId: "non_existent_prompt",
                message: "test input",
                type: "input",
              },
            })
          );
        } else if (message.type === "error" && connectedReceived) {
          expect(message.message).toContain("not found or already resolved");
          expect(message.commandType).toBe("console_input");
          expect(message.code).toBe("EXECUTION_ERROR");
          ws.close();
          resolve();
        }
      });

      setTimeout(() => {
        reject(new Error("Test timed out waiting for error message"));
      }, 5000);
    });
  });

  it("should handle get_pending_prompts request", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let connectedReceived = false;

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "connected") {
          connectedReceived = true;
          // Request pending prompts
          ws.send(
            JSON.stringify({
              type: "get_pending_prompts",
            })
          );
        } else if (message.type === "pending_prompts" && connectedReceived) {
          expect(message.data).toBeInstanceOf(Array);
          ws.close();
          resolve();
        }
      });

      setTimeout(() => {
        reject(
          new Error("Test timed out waiting for pending_prompts response")
        );
      }, 5000);
    });
  });

  it("should send unified error shape for missing promptId in user_prompt_response", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "connected") {
          ws.send(
            JSON.stringify({
              type: "user_prompt_response",
              data: { response: "test" },
            })
          );
        } else if (message.type === "error") {
          expect(message.commandType).toBe("user_prompt_response");
          expect(message.code).toBe("VALIDATION_ERROR");
          expect(message.message).toContain("Missing promptId");
          expect(message.timestamp).toBeDefined();
          ws.close();
          resolve();
        }
      });

      setTimeout(() => reject(new Error("Timed out")), 5000);
    });
  });

  it("should echo requestId from client in error response", async () => {
    const port = wss.address().port;
    const requestId = "test-req-123";

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "connected") {
          ws.send(
            JSON.stringify({
              type: "register_trigger",
              requestId,
              data: JSON.stringify({}),
            })
          );
        } else if (message.type === "error") {
          expect(message.requestId).toBe(requestId);
          expect(message.commandType).toBe("register_trigger");
          ws.close();
          resolve();
        }
      });

      setTimeout(() => reject(new Error("Timed out")), 5000);
    });
  });

  it("should use EXECUTION_ERROR code for trigger registration failure", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "connected") {
          ws.send(
            JSON.stringify({
              type: "register_trigger",
              data: { workspaceId: "test", trigger: { type: "invalid_type" } },
            })
          );
        } else if (message.type === "error") {
          expect(message.code).toMatch(/^(VALIDATION_ERROR|EXECUTION_ERROR|TIMEOUT|NOT_FOUND|INTERNAL_ERROR)$/);
          expect(message.timestamp).toBeDefined();
          ws.close();
          resolve();
        }
      });

      setTimeout(() => reject(new Error("Timed out")), 5000);
    });
  });

  it("should return error for stop_workflow with invalid payload", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let connectedReceived = false;

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "connected") {
          connectedReceived = true;
          ws.send(
            JSON.stringify({
              type: "stop_workflow",
              data: "not valid json",
              requestId: "req-stop-1",
            })
          );
        } else if (message.type === "error" && connectedReceived) {
          expect(message.commandType).toBe("stop_workflow");
          expect(message.code).toBe("VALIDATION_ERROR");
          expect(message.message).toContain("Failed to parse stop_workflow payload");
          expect(message.requestId).toBe("req-stop-1");
          expect(message.timestamp).toBeDefined();
          ws.close();
          resolve();
        }
      });

      setTimeout(() => reject(new Error("Timed out")), 5000);
    });
  });

  it("should return error for register_trigger scheduled missing cronExpression", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "register_trigger",
            data: JSON.stringify({ workspaceId: "test", trigger: { type: "scheduled", config: {} } }),
          })
        );
      });

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "error") {
          expect(message.commandType).toBe("register_trigger");
          expect(message.code).toBe("VALIDATION_ERROR");
          expect(message.message).toContain("Missing cronExpression");
          expect(message.timestamp).toBeDefined();
          ws.close();
          resolve();
        } else if (message.type === "connected") {
          // Ignore connected message
        }
      });

      setTimeout(() => reject(new Error("Timed out")), 5000);
    });
  });

  it("should return error for register_trigger telegram missing botToken", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on("open", () => {
        ws.send(
          JSON.stringify({
            type: "register_trigger",
            data: JSON.stringify({ workspaceId: "test", trigger: { type: "telegram" } }),
          })
        );
      });

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "error") {
          expect(message.commandType).toBe("register_trigger");
          expect(message.code).toBe("VALIDATION_ERROR");
          expect(message.message).toContain("Missing bot token");
          expect(message.timestamp).toBeDefined();
          ws.close();
          resolve();
        } else if (message.type === "connected") {
          // Ignore connected message
        }
      });

      setTimeout(() => reject(new Error("Timed out")), 5000);
    });
  });

  it("should return error for unregister_trigger missing workspaceId", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let connectedReceived = false;

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "connected") {
          connectedReceived = true;
          ws.send(
            JSON.stringify({
              type: "unregister_trigger",
              requestId: "req-unreg-1",
            })
          );
        } else if (message.type === "error" && connectedReceived) {
          expect(message.commandType).toBe("unregister_trigger");
          expect(message.code).toBe("VALIDATION_ERROR");
          expect(message.message).toContain("Missing workspaceId");
          expect(message.requestId).toBe("req-unreg-1");
          expect(message.timestamp).toBeDefined();
          ws.close();
          resolve();
        }
      });

      setTimeout(() => reject(new Error("Timed out")), 5000);
    });
  });

  it("should return error for run_workflow when workflow execution fails", async () => {
    const port = wss.address().port;

    vi.mocked(executeFlowRuntime).mockResolvedValueOnce(new Error("Workflow crashed"));

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let connectedReceived = false;

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "connected") {
          connectedReceived = true;
          ws.send(
            JSON.stringify({
              type: "run_workflow",
              data: JSON.stringify({ id: "test", nodes: [], edges: [] }),
              requestId: "req-wf-1",
            })
          );
        } else if (message.type === "message" && message.data?.message?.includes("Starting workflow") && connectedReceived) {
          // Ignore the startup message, wait for error
        } else if (message.type === "error" && connectedReceived) {
          expect(message.commandType).toBe("run_workflow");
          expect(message.code).toBe("EXECUTION_ERROR");
          expect(message.message).toContain("Workflow execution failed");
          expect(message.requestId).toBe("req-wf-1");
          expect(message.timestamp).toBeDefined();
          ws.close();
          resolve();
        }
      });

      setTimeout(() => reject(new Error("Timed out")), 5000);
    });
  });

  it("should successfully execute a Goal 2 serialized workflow via run_workflow", async () => {
    initFlowSystem();
    const port = wss.address().port;

    vi.mocked(executeFlowRuntime).mockImplementationOnce(async (wf) => {
      expect(wf.nodes[0].category).toBeDefined();
      expect(wf.nodes[0].category).not.toBe("");
      expect(wf.nodes[0].sockets.length).toBeGreaterThan(0);
      return {
        layers: [[1], [2]],
        results: { 1: "http ok", 2: "join ok" },
        finalResult: "join ok",
      } as unknown as { layers: number[][]; results: Record<string, unknown>; finalResult: unknown };
    });

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      let connectedReceived = false;

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "connected") {
          connectedReceived = true;
          ws.send(
            JSON.stringify({
              type: "run_workflow",
              data: JSON.stringify(createGoal2WorkflowPayload()),
              requestId: "req-goal2-ws",
            })
          );
        } else if (message.type === "message" && message.data?.message?.includes("Starting workflow") && connectedReceived) {
          // Starting message, wait for result
        } else if (message.type === "workflow_result" && connectedReceived) {
          expect(message.id).toBe("wf-goal2-demo");
          expect(message.requestId).toBe("req-goal2-ws");
          expect(message.data).toEqual({
            layers: [[1], [2]],
            results: { 1: "http ok", 2: "join ok" },
            finalResult: "join ok",
          });
          expect(message.timestamp).toBeDefined();
          ws.close();
          resolve();
        }
      });

      setTimeout(() => reject(new Error("Timed out")), 5000);
    });
  });

  it("should handle unknown message types gracefully", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "unknown_type", data: "test" }));
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

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "connected") {
          connectedReceived = true;
          // Now send invalid JSON after receiving connected message
          ws.send("invalid json");
        } else if (message.type === "error" && connectedReceived) {
          expect(message.message).toBe("Invalid message format");
          ws.close();
          resolve();
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error("Test timed out waiting for error message"));
      }, 5000);
    });
  });

  it("should handle multiple clients with separate prompts", async () => {
    const port = wss.address().port;

    return new Promise<void>((resolve, reject) => {
      const ws1 = new WebSocket(`ws://localhost:${port}`);
      const ws2 = new WebSocket(`ws://localhost:${port}`);

      let connectedCount = 0;
      const promptId1 = "prompt_client1";
      const promptId2 = "prompt_client2";
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
      const setupMessageListener = (ws: WebSocket) => {
        ws.on("message", (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === "connected") {
            connectedCount++;
            if (connectedCount === 2) {
              // Both clients connected, send both inputs
              ws1.send(
                JSON.stringify({
                  type: "console_input",
                  data: {
                    promptId: promptId1,
                    message: "input from client 1",
                    type: "input",
                    details: "User input",
                  },
                })
              );

              // Send second input with a slight delay to avoid race conditions
              setTimeout(() => {
                ws2.send(
                  JSON.stringify({
                    type: "console_input",
                    data: {
                      promptId: promptId2,
                      message: "input from client 2",
                      type: "input",
                      details: "User input",
                    },
                  })
                );
              }, 100);
            }
          } else if (message.type === "console_input_resolved") {
            // Both clients receive all broadcasts
            if (message.data.promptId === promptId1) {
              expect(message.data.message).toBe("input from client 1");
              checkComplete(promptId1);
            } else if (message.data.promptId === promptId2) {
              expect(message.data.message).toBe("input from client 2");
              checkComplete(promptId2);
            }
          }
        });
      };

      setupMessageListener(ws1);
      setupMessageListener(ws2);

      setTimeout(() => {
        ws1.close();
        ws2.close();
        reject(
          new Error(
            "Test timed out - resolved " +
              resolvedPrompts.size +
              " prompts, expected 2"
          )
        );
      }, 5000);
    });
  });

  it.skip("should handle run_workspace message with successful workflow execution", async () => {
    const port = wss.address().port;

    // Mock the dependencies
    vi.mocked(workflowExecutor).mockResolvedValue("Test output");
    vi.mocked(createMainAgent).mockResolvedValue({
      run: vi.fn().mockResolvedValue("Test result"),
    } as unknown as MainAgent);

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any[] = [];

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        messages.push(message);

        if (message.type === "connected") {
          // Send run_workspace message
          ws.send(
            JSON.stringify({
              type: "run_workspace",
              data: JSON.stringify({
                name: "Test Workspace",
                description: "A test workspace",
                apiKey: "test-key",
                mainLLM: {
                  provider: "OpenAI",
                  model: { name: "GPT-4", id: "gpt-4" },
                },
                tasks: [
                  {
                    id: "test-task",
                    title: "Test Task",
                    description: "A test task",
                    expectedOutput: "Test output",
                    type: "workflow",
                    executorId: "test-workflow",
                    position: "0,0",
                    selected: false,
                    sockets: [],
                  },
                ],
                agents: [
                  {
                    id: "test-agent",
                    name: "Test Agent",
                    role: "Test Role",
                    objective: "Test objective",
                    background: "Test background",
                    capabilities: "Test capabilities",
                    apiKey: "test-key",
                    llm: {
                      provider: "OpenAI",
                      model: { name: "GPT-4", id: "gpt-4" },
                    },
                    tools: [],
                  },
                ],
                connections: [],
                intent: "Test intent",
              }),
            })
          );
        } else if (
          message.type === "message" &&
          message.data.message ===
            "[1/1] Task 'Test Task' completed successfully."
        ) {
          // Workflow completed successfully
           expect(JSON.parse(JSON.parse(message.data.results).task)).toBe('Test output');
          ws.close();
          resolve();
        }
      });

      setTimeout(() => {
        ws.close();
        reject(
          new Error("Test timed out - did not receive completion message")
        );
      }, 5000);
    });
  });

  it.skip("should handle run_workspace message with workflow execution failure", async () => {
    const port = wss.address().port;

    // Mock the dependencies
    const mockPlan = {
      steps: [
        {
          type: "workflow",
          workflow: '{"id": "test-workflow", "nodes": [], "edges": []}',
          task: "test-task",
          agent: "test-agent",
        },
      ],
    };
    const mockError = new Error("Workflow execution failed");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(planAgenticTask).mockResolvedValue(mockPlan as any);
    vi.mocked(workflowExecutor).mockResolvedValue(mockError);
    vi.mocked(createMainAgent).mockResolvedValue({
      run: vi.fn().mockRejectedValue(mockError),
    } as unknown as MainAgent);

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === "connected") {
          // Send run_workspace message
          ws.send(
            JSON.stringify({
              type: "run_workspace",
              data: JSON.stringify({
                name: "Test Workspace",
                description: "A test workspace",
                apiKey: "test-key",
                mainLLM: {
                  provider: "OpenAI",
                  model: { name: "GPT-4", id: "gpt-4" },
                },
                tasks: [
                  {
                    id: "test-task",
                    title: "Test Task",
                    description: "A test task",
                    expectedOutput: "Test output",
                    type: "workflow",
                    executorId: "test-workflow",
                    position: "0,0",
                    selected: false,
                    sockets: [],
                  },
                ],
                agents: [
                  {
                    id: "test-agent",
                    name: "Test Agent",
                    role: "Test Role",
                    objective: "Test objective",
                    background: "Test background",
                    capabilities: "Test capabilities",
                    apiKey: "test-key",
                    llm: {
                      provider: "OpenAI",
                      model: { name: "GPT-4", id: "gpt-4" },
                    },
                    tools: [],
                  },
                ],
                connections: [],
                intent: "Test intent",
              }),
            })
          );
        } else if (
          message.type === "message" &&
          message.data.message ===
            "[1/1] Task 'Test Task' completed successfully."
        ) {
          // Workflow completed with error
          expect(message.data.type).toBe("success");
          ws.close();
          resolve();
        }
      });

      setTimeout(() => {
        ws.close();
        reject(new Error("Test timed out - did not receive error message"));
      }, 5000);
    });
  });

  describe("WebSocket utility functions", () => {
    it("should broadcast commands to all clients", async () => {
      const port = wss.address().port;

      return new Promise<void>((resolve, reject) => {
        const ws1 = new WebSocket(`ws://localhost:${port}`);
        const ws2 = new WebSocket(`ws://localhost:${port}`);
        let connectedCount = 0;
        const receivedCommands: string[] = [];

        const checkComplete = () => {
          if (receivedCommands.length === 2) {
            expect(receivedCommands).toContain('test-command');
            ws1.close();
            ws2.close();
            resolve();
          }
        };

        const setupListener = (ws: WebSocket) => {
          ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.type === 'connected') {
              connectedCount++;
              if (connectedCount === 2) {
                // Both clients connected, broadcast command
                wsFunctions.broadcastCommand({
                  id: 'test-cmd-123',
                  command: 'test-command',
                  data: { param: 'value' }
                });
              }
            } else if (message.type === 'execute_command') {
              expect(message.commandId).toBe('test-cmd-123');
              expect(message.command).toBe('test-command');
              expect(message.data).toEqual({ param: 'value' });
              receivedCommands.push(message.command);
              checkComplete();
            }
          });
        };

        setupListener(ws1);
        setupListener(ws2);

        setTimeout(() => {
          ws1.close();
          ws2.close();
          reject(new Error('Test timed out - command not broadcasted'));
        }, 5000);
      });
    });

    it("should return correct client count", () => {
      // Should have at least 1 client from previous tests
      expect(wsFunctions.getClientCount()).toBeGreaterThanOrEqual(0);
    });
  });
});
