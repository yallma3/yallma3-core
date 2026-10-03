import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import * as crypto from "crypto";
import { createMainAgent } from "../Utils/Runtime";
import { ConsoleInputUtils } from "../Workflow/Nodes/ConsoleInput";
import { resolveUserPrompt } from "../Workflow/Nodes/UserPromptNode";
import type { ConsoleEvent } from "../Models/Workspace";
import type { MainAgent } from "../Agent/Main/MainAgent";
import { scheduledTriggerManager } from "../Trigger/ScheduledTriggerManager";
import { webhookTriggerManager } from "../Trigger/WebhookTriggerManager";
import { telegramTriggerManager } from "../Trigger/TelegramTriggerManager";
import { Helper } from "../Utils/Helper";
import { WorkspaceRepository } from "../Execution/WorkspaceRepository";
import { WebSocketContext } from "../Execution/ExecutionContext";
import { ExecutionOrchestrator } from "../Execution/Orchestrator";

export type CommandErrorCode =
  | 'VALIDATION_ERROR'
  | 'EXECUTION_ERROR'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'

export function sendCommandError(
  ws: WebSocket,
  commandType: string,
  code: CommandErrorCode,
  message: string,
  requestId?: string,
) {
  ws.send(JSON.stringify({
    type: 'error',
    requestId,
    commandType,
    code,
    message,
    timestamp: new Date().toISOString(),
  }))
}

export function setupWebSocketServer(wss: WebSocketServer, _instanceId?: string) {
  const clients = new Set<WebSocket>();
  let currentWorkspaceAgent: MainAgent | null = null;

  function broadcast(message: unknown) {
    const messageStr = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  const repo = WorkspaceRepository.getInstance();
  const orchestrator = new ExecutionOrchestrator(repo, broadcast);

  scheduledTriggerManager.setExecutionCallback((workspaceId) => {
    orchestrator.onScheduledTrigger(workspaceId);
  });

  webhookTriggerManager.setExecutionCallback((workspaceId, payload) => {
    orchestrator.onWebhookTrigger(workspaceId, payload);
  });

  telegramTriggerManager.setExecutionCallback(async (workspaceId, update) => {
    await orchestrator.onTelegramTrigger(workspaceId, update);
  });

  // MAIN CLIENT CONNECTION HANDLER

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const wsProtocol = req.headers["sec-websocket-protocol"] as string | undefined;
    const clientId = _instanceId ? `instance-id=${_instanceId}` : (wsProtocol ? `subprotocol=${wsProtocol}` : "unauthenticated");
    console.log(
      "New WebSocket connection established:",
      req.socket.remoteAddress,
      clientId
    );
    clients.add(ws);

    // Handle incoming messages from frontend
    ws.on("message", async (message: WebSocket.RawData) => {
      try {
        const data = Helper.JsonParser.parse(message.toString());
        console.log("Client Count:", clients.size, "Message: ", data.type);
        let consoleMessage: ConsoleEvent | null = null;

        switch (data.type) {
          case "ping":
            ws.send(
              JSON.stringify({
                type: "pong",
                timestamp: new Date().toISOString(),
              })
            );
            break;

          case "user_prompt_response": {
            let payload = data.data;
            if (typeof payload === 'string') {
              const parsed = Helper.JsonParser.safeParse(payload);
              if (parsed.success) payload = parsed.data;
            }
            
            const { promptId, response } = payload;
            
            console.log(`[SERVER STDOUT]  PromptID: ${promptId}, Response: "${response}"`);
            
            if (!promptId) {
              sendCommandError(ws, data.type, 'VALIDATION_ERROR', 'Missing promptId in user prompt response', data.requestId)
              break;
            }

            const success = resolveUserPrompt(promptId, response || "");
            
            console.log(`[SERVER STDOUT]  Resolve result: ${success}`);
            
            if (success) {
              console.log(` Resolved user prompt ${promptId}`);
              
              broadcast({
                type: "user_prompt_resolved",
                promptId,
                response,
                timestamp: new Date().toISOString(),
              });
              
              ws.send(
                JSON.stringify({
                  type: "user_prompt_acknowledged",
                  promptId,
                  success: true,
                  timestamp: new Date().toISOString(),
                })
              );
            } else {
              console.warn(` Failed to resolve user prompt ${promptId}`);
              
              sendCommandError(ws, data.type, 'EXECUTION_ERROR', `Failed to resolve prompt ${promptId} - prompt not found or already resolved`, data.requestId)
            }
            break;
          }
          case "stop_workflow": {
            try {
              const payload = typeof data.data === "string" ? Helper.JsonParser.parse(data.data) : data.data;
              const workflowId = String(payload?.workflowId ?? "default");
              orchestrator.abortWorkspace(workflowId);
              console.log(`[SERVER STDOUT] [Stop] Received stop request for workflow: ${workflowId}`);
              ws.send(JSON.stringify({ type: "workflow_stopped", workflowId, timestamp: new Date().toISOString() }));
            } catch (e) {
              console.error("Failed to parse stop_workflow payload:", e);
              sendCommandError(ws, data.type, 'VALIDATION_ERROR', `Failed to parse stop_workflow payload: ${e}`, data.requestId)
            }
            break;
          }

          case "register_trigger": {
            console.log(`[SERVER STDOUT] Register trigger request`);

            if (!data.data) {
              sendCommandError(ws, data.type, 'VALIDATION_ERROR', 'Missing trigger data', data.requestId)
              break;
            }

            const payload = Helper.JsonParser.parse(data.data);
            const { workspaceId, trigger, workspaceData, baseWorkflowsPath } =
              payload;

            if (!workspaceId || !trigger) {
              sendCommandError(ws, data.type, 'VALIDATION_ERROR', 'Missing workspaceId or trigger', data.requestId)
              break;
            }

            // SCHEDULED TRIGGER
            if (trigger.type === "scheduled") {
              console.log(
                `[SERVER STDOUT] ⏰ Registering SCHEDULED trigger for: ${workspaceId}`
              );

              if (!trigger.config || !trigger.config.cronExpression) {
                sendCommandError(ws, data.type, 'VALIDATION_ERROR', 'Missing cronExpression in scheduled trigger', data.requestId)
                break
              }

              if (workspaceData) {
                repo.set(workspaceId, workspaceData);
                repo.hydrate(workspaceId, baseWorkflowsPath);
                console.log(
                  `[SERVER STDOUT]  Cached FULL workspace data for: ${workspaceId}`
                );
              }

              try {
                const result =
                  scheduledTriggerManager.registerTrigger(
                    workspaceId,
                    trigger
                  );

                if (result.success) {
                  ws.send(
                    JSON.stringify({
                      type: "trigger_registered",
                      success: true,
                      workspaceId,
                      trigger,
                      data: {
                        nextExecutionTime: result.nextExecutionTime,
                        cronExpression: trigger.config.cronExpression,
                        timezone: trigger.config.timezone || "UTC",
                      },
                      timestamp: new Date().toISOString(),
                    })
                  );
                } else {
                  throw new Error(result.error || "Unknown error");
                }
              } catch (error) {
                console.error(
                  `[SERVER STDERR]  Failed to register scheduled trigger:`,
                  error
                );
                sendCommandError(ws, data.type, 'EXECUTION_ERROR', `Failed to register scheduled trigger: ${error}`, data.requestId)
              }
            }
            // WEBHOOK TRIGGER
            else if (trigger.type === "webhook") {
              console.log(
                `[SERVER STDOUT] 🔗 Registering WEBHOOK trigger for: ${workspaceId}`
              );

              if (workspaceData) {
                repo.set(workspaceId, workspaceData);
                repo.hydrate(workspaceId, baseWorkflowsPath);
                console.log(
                  `[SERVER STDOUT] 💾 Cached FULL workspace data for: ${workspaceId}`
                );
              }

              try {
                const result = webhookTriggerManager.registerWebhook(
                  workspaceId,
                  trigger
                );

                if (result.success) {
                  ws.send(
                    JSON.stringify({
                      type: "trigger_registered",
                      success: true,
                      workspaceId,
                      trigger,
                      data: {
                        webhookUrl: result.webhookUrl,
                        secret: result.secret,
                      },
                      timestamp: new Date().toISOString(),
                    })
                  );
                } else {
                  throw new Error(result.error || "Unknown error");
                }
              } catch (error) {
                console.error(
                  `[SERVER STDERR]  Failed to register webhook trigger:`,
                  error
                );
                sendCommandError(ws, data.type, 'EXECUTION_ERROR', `Failed to register webhook trigger: ${error}`, data.requestId)
              }
            }
            // TELEGRAM TRIGGER
            else if (trigger.type === "telegram") {
              console.log(
                `[SERVER STDOUT] 📱 Registering TELEGRAM trigger for: ${workspaceId}`
              );

              if (!trigger.config || !trigger.config.botToken) {
                sendCommandError(ws, data.type, 'VALIDATION_ERROR', 'Missing bot token in Telegram trigger', data.requestId)
                break;
              }

              if (!trigger.config.updateTypes || trigger.config.updateTypes.length === 0) {
                sendCommandError(ws, data.type, 'VALIDATION_ERROR', 'At least one update type must be selected', data.requestId)
                break
              }

              if (workspaceData) {
                repo.set(workspaceId, workspaceData);
                repo.hydrate(workspaceId, baseWorkflowsPath);
                console.log(
                  `[SERVER STDOUT] 💾 Cached FULL workspace data for: ${workspaceId}`
                );
              }

              try {
                const result = await telegramTriggerManager.registerTelegramBot(
                  workspaceId,
                  trigger
                );

                if (result.success) {
                  ws.send(
                    JSON.stringify({
                      type: "trigger_registered",
                      success: true,
                      workspaceId,
                      trigger,
                      data: {
                        webhookUrl: result.webhookUrl,
                        secretToken: result.secretToken,
                        botInfo: result.botInfo,
                      },
                      timestamp: new Date().toISOString(),
                    })
                  );
                } else {
                  throw new Error(result.error || "Unknown error");
                }
              } catch (error) {
                console.error(
                  `[SERVER STDERR]  Failed to register Telegram trigger:`,
                  error
                )
                sendCommandError(ws, data.type, 'EXECUTION_ERROR', `Failed to register Telegram trigger: ${error}`, data.requestId)
              }
            }
            // MANUAL TRIGGER
            else if (trigger.type === "manual") {
              console.log(
                `[SERVER STDOUT]  Manual trigger configured for: ${workspaceId} (on-demand only)`
              );

              ws.send(
                JSON.stringify({
                  type: "trigger_registered",
                  success: true,
                  workspaceId,
                  trigger,
                  message: "Manual trigger configured (runs on-demand)",
                  timestamp: new Date().toISOString(),
                })
              );
            } else {
              console.error(
                `[SERVER STDERR]  Unknown trigger type: ${trigger.type}`
              )
              sendCommandError(ws, data.type, 'VALIDATION_ERROR', `Unknown trigger type: ${trigger.type}`, data.requestId)
            }
            break;
          }

          case "unregister_trigger": {
            console.log(`[SERVER STDOUT]  Unregister trigger request`);

            const workspaceId = data.workspaceId;

            if (!workspaceId) {
              sendCommandError(ws, data.type, 'VALIDATION_ERROR', 'Missing workspaceId', data.requestId)
              break;
            }

            scheduledTriggerManager.unregisterTrigger(workspaceId);
            webhookTriggerManager.unregisterWorkspaceWebhooks(workspaceId);
            await telegramTriggerManager.unregisterTelegramBot(workspaceId);

            repo.delete(workspaceId);

            ws.send(
              JSON.stringify({
                type: "trigger_unregistered",
                success: true,
                workspaceId,
                timestamp: new Date().toISOString(),
              })
            );
            break;
          }

          case "run_workspace": {
            consoleMessage = {
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              type: "system",
              message: "Starting workspace runtime...",
            };

            ws.send(
              JSON.stringify({
                type: "message",
                data: consoleMessage,
                timestamp: new Date().toISOString(),
              })
            );

            const wsCtx = new WebSocketContext(ws, broadcast);
            wsCtx.requestId = data.requestId;
            currentWorkspaceAgent = createMainAgent(data.data, wsCtx);
            try {
              await currentWorkspaceAgent.run();
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error("Workspace execution error:", errorMessage);
              sendCommandError(ws, data.type, 'EXECUTION_ERROR', `Workspace execution failed: ${errorMessage}`, data.requestId)
            }
            break;
          }

          case "abort_workspace":
            console.log("Abort Message");

            if (currentWorkspaceAgent) {
              currentWorkspaceAgent.abort();
            }

            ws.send(
              JSON.stringify({
                type: "workspace_aborted",
                message: "Workspace execution aborted by user.",
                timestamp: new Date().toISOString(),
              })
            );

            break;

          case "run_workflow": {
            consoleMessage = {
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              type: "info",
              message: "Starting workflow runtime",
            };

            ws.send(
              JSON.stringify({
                type: "message",
                data: consoleMessage,
                timestamp: new Date().toISOString(),
              })
            );

            const workflow = Helper.JsonParser.parse(data.data);
            const ctx = new WebSocketContext(ws, broadcast);
            const result = await orchestrator.runWorkflow(workflow, ctx);

            if (result instanceof Error) {
              sendCommandError(ws, data.type, 'EXECUTION_ERROR', `Workflow execution failed: ${result.message}`, data.requestId)
            } else {
              ws.send(
                JSON.stringify({
                  id: workflow.id,
                  type: "workflow_result",
                  data: result,
                  timestamp: new Date().toISOString(),
                })
              );
            }
            break;
          }
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
              const { promptId, message: inputMessage } = event;

              if (promptId && inputMessage) {
                // Resolve the specific prompt
                const resolved = ConsoleInputUtils.resolvePrompt(
                  promptId,
                  inputMessage
                );

                if (resolved) {
                  console.log(
                    `Resolved prompt ${promptId} with input: ${inputMessage}`
                  );

                  // Add the event to console history
                  ConsoleInputUtils.addEvent(event);

                  // Broadcast confirmation to all clients
                  broadcast({
                    type: "console_input_resolved",
                    data: {
                      promptId,
                      message: inputMessage,
                      timestamp: new Date().toISOString(),
                    },
                    timestamp: new Date().toISOString(),
                  });
                } else {
                  console.warn(
                    `Failed to resolve prompt ${promptId} - prompt not found or already resolved`
                  );

                  // Send error back to client
                  sendCommandError(ws, data.type, 'EXECUTION_ERROR', `Failed to resolve prompt ${promptId} - prompt not found or already resolved`, data.requestId)
                }
              } else {
                console.warn("Console input missing promptId or message");
                sendCommandError(ws, data.type, 'VALIDATION_ERROR', 'Invalid console input format - missing promptId or message', data.requestId)
              }
            }
            break;

          case "get_pending_prompts": {
            // Allow frontend to request current pending prompts
            const pendingPrompts = ConsoleInputUtils.getPendingPrompts();
            ws.send(
              JSON.stringify({
                type: "pending_prompts",
                data: pendingPrompts,
                timestamp: new Date().toISOString(),
              })
            );
            break;
          }

          default:
            console.log("Unknown message type:", data.type);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
        sendCommandError(ws, 'unknown', 'INTERNAL_ERROR', 'Invalid message format')
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

  setInterval(() => {
    ConsoleInputUtils.cleanupPrompts(300000);
  }, 300000);

  return {
    broadcast,
    sendToClient,
    broadcastCommand,
    getClientCount: () => clients.size,
  };
}