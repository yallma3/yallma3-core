import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { createMainAgent } from "../Utils/Runtime";
import { executeFlowRuntime } from "../Workflow/runtime";

import { ConsoleInputUtils } from "../Workflow/Nodes/ConsoleInput";
import { resolveUserPrompt } from "../Workflow/Nodes/UserPromptNode"; // ✅ NEW - ADD THIS LINE
import type { ConsoleEvent, WorkspaceData } from "../Models/Workspace";
import type { MainAgent } from "../Agent/Main/MainAgent";
import { scheduledTriggerManager } from "../Trigger/ScheduledTriggerManager";
import { webhookTriggerManager } from "../Trigger/WebhookTriggerManager";
import { telegramTriggerManager } from "../Trigger/TelegramTriggerManager";
import { telegramQueue } from "../Trigger/TelegramQueue";

export let globalBroadcast: ((message: unknown) => void) | null = null;

export function setupWebSocketServer(wss: WebSocketServer) {
  const clients = new Set<WebSocket>();
  let currentWorkspaceAgent: MainAgent | null = null;

  const workspaceDataCache = new Map<string, string>();
  const workspacePathsCache = new Map<string, string>();
  const workflowRequestsMap = new Map<string, string>();

  function broadcast(message: unknown) {
    const messageStr = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  globalBroadcast = broadcast;

  function hydrateWorkspaceData(
    workspaceId: string,
    data: WorkspaceData,
    providedBasePath?: string
  ): WorkspaceData {
    const basePath = providedBasePath || workspacePathsCache.get(workspaceId);

    if (!basePath || !data.workflows) return data;

    console.log(`[SERVER STDOUT] 💧 Hydrating workspace ${workspaceId}...`);

    data.workflows.forEach((wf: any) => {
      try {
        const flowsPath = path.join(basePath, "flows", `${wf.id}.json`);
        const rootPath = path.join(basePath, `${wf.name}.json`);

        let fullPath: string | null = null;
        if (fs.existsSync(flowsPath)) fullPath = flowsPath;
        else if (fs.existsSync(rootPath)) fullPath = rootPath;

        if (fullPath) {
          const content = fs.readFileSync(fullPath, "utf-8");
          const graph = JSON.parse(content);
          let nodes = graph.nodes;
          let connections = graph.connections;
          if (graph.canvasState) {
            nodes = graph.canvasState.nodes;
            connections = graph.canvasState.connections;
          }
          if (nodes) {
            wf.nodes = nodes;
            wf.connections = connections || [];
          }
        }
      } catch (e) {
        console.error(` Failed to hydrate '${wf.name}':`, e);
      }
    });

    if (data.tasks) {
      data.tasks.forEach((task: any) => {
        if (task.workflow && task.workflow.id) {
          const hydratedWf = data.workflows.find(
            (w: any) => w.id === task.workflow.id
          );
          if (hydratedWf && hydratedWf.nodes && hydratedWf.nodes.length > 0) {
            task.workflow = hydratedWf;
          }
        }
      });
    }

    return data;
  }

  // SCHEDULED TRIGGER LOGIC
  scheduledTriggerManager.setExecutionCallback(async (workspaceId: string) => {
    console.log(` Executing workspace ${workspaceId} via scheduled trigger`);

    const workspaceDataStr = workspaceDataCache.get(workspaceId);

    if (!workspaceDataStr) {
      console.error(` No workspace data found for ${workspaceId}`);

      const nextExecutionTime =
        scheduledTriggerManager.getNextExecutionTime(workspaceId);

      console.log(
        ` Next execution time: ${
          nextExecutionTime
            ? new Date(nextExecutionTime).toISOString()
            : "null"
        }`
      );

      broadcast({
        type: "trigger_execution",
        workspaceId,
        data: {
          success: false,
          message: "Workspace data not found",
          nextExecutionTime,
        },
      });
      return;
    }

    try {
      broadcast({
        type: "message",
        data: {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "system",
          message: ` Workspace triggered by schedule: ${workspaceId}`,
        },
        timestamp: new Date().toISOString(),
      });

      const listeners: Record<string, Function[]> = {};

      const mockWs = {
        send: async (msg: string) => {
          try {
            const data = JSON.parse(msg);

            const isWorkflowRequest =
              data.type === "run_workflow" ||
              (data.data &&
                typeof data.data === "string" &&
                data.data.includes('"nodes"')) ||
              (data.data &&
                typeof data.data === "string" &&
                data.data.includes("wf-"));

            if (isWorkflowRequest) {
              console.log(
                " [MockWS] Intercepting background workflow execution..."
              );

              let workflow = data.data;
              let workflowId = data.id || data.requestId;

              if (typeof workflow === "string") {
                try {
                  workflow = JSON.parse(workflow);
                } catch (e) {}
              }
              if (workflow.workflow) workflow = workflow.workflow;
              else if (workflow.data) workflow = workflow.data;

              if (
                typeof data.data === "string" &&
                !data.data.startsWith("{")
              ) {
                const targetId = data.data;
                const wsData: WorkspaceData = JSON.parse(workspaceDataStr);
                const foundWf = wsData.workflows.find(
                  (w: any) => w.id === targetId
                );
                if (foundWf) {
                  workflow = foundWf;
                }
              }

              if (
                (!workflow.nodes || !Array.isArray(workflow.nodes)) &&
                workflow.id
              ) {
                const basePath = workspacePathsCache.get(workspaceId);
                if (basePath) {
                  const flowsPath = path.join(
                    basePath,
                    "flows",
                    `${workflow.id}.json`
                  );
                  const rootNamePath = workflow.name
                    ? path.join(basePath, `${workflow.name}.json`)
                    : null;
                  let fullPath =
                    fs.existsSync(flowsPath) && flowsPath
                      ? flowsPath
                      : rootNamePath && fs.existsSync(rootNamePath)
                      ? rootNamePath
                      : null;

                  if (fullPath) {
                    try {
                      const fileContent = fs.readFileSync(fullPath, "utf-8");
                      const graphData = JSON.parse(fileContent);

                      let nodes = graphData.nodes;
                      let connections = graphData.connections;
                      if (graphData.canvasState) {
                        nodes = graphData.canvasState.nodes;
                        connections = graphData.canvasState.connections;
                      }

                      if (nodes) {
                        workflow.nodes = nodes;
                        workflow.connections = connections || [];
                        console.log(
                          ` [MockWS] Hydrated '${
                            workflow.name || workflow.id
                          }' from disk! Nodes: ${workflow.nodes.length}`
                        );
                      }
                    } catch (err) {
                      console.error(` [MockWS] Disk read failed:`, err);
                    }
                  }
                }
              }

              if (
                !workflow.nodes ||
                !Array.isArray(workflow.nodes) ||
                workflow.nodes.length === 0
              ) {
                console.error(
                  " [MockWS] ABORTING: Workflow has no nodes."
                );
                return;
              }

              try {
                console.log(`[MockWS] Starting execution...`);

                const context = data.context || "";
                const result = await executeFlowRuntime(
                  workflow,
                  mockWs as any,
                  context
                );

                console.log(` [MockWS] Execution finished.`);

                const responseEvent = {
                  type: "workflow_json",
                  id: workflowId,
                  data: result,
                  timestamp: new Date().toISOString(),
                };

                if (listeners["message"]) {
                  const rawEvent = {
                    toString: () => JSON.stringify(responseEvent),
                  };
                  listeners["message"].forEach((cb) => cb(rawEvent));
                }
              } catch (execError) {
                console.error(" [MockWS] Execution Error:", execError);
                if (listeners["message"]) {
                  const errorEvent = {
                    type: "error",
                    requestId: workflowId,
                    message: String(execError),
                  };
                  const rawEvent = {
                    toString: () => JSON.stringify(errorEvent),
                  };
                  listeners["message"].forEach((cb) => cb(rawEvent));
                }
              }
              return;
            }

            broadcast(data);
          } catch (e) {
            console.error(
              "Failed to broadcast/intercept message:",
              e
            );
          }
        },
        on: (event: string, callback: Function) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(callback);
        },
        off: (event: string, callback: Function) => {
          if (!listeners[event]) return;
          listeners[event] = listeners[event].filter((cb) => cb !== callback);
        },
        removeListener: (event: string, callback: Function) => {
          if (!listeners[event]) return;
          listeners[event] = listeners[event].filter((cb) => cb !== callback);
        },
        once: (event: string, callback: Function) => {
          const onceWrapper = (...args: any[]) => {
            callback(...args);
            if (listeners[event])
              listeners[event] = listeners[event].filter(
                (cb) => cb !== onceWrapper
              );
          };
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(onceWrapper);
        },
        emit: (event: string, ...args: any[]) => {
          if (listeners[event])
            listeners[event].forEach((cb) => cb(...args));
        },
        readyState: 1,
        close: () => {},
        terminate: () => {},
      } as unknown as WebSocket;

      const workspaceAgent = createMainAgent(workspaceDataStr, mockWs);
      await workspaceAgent.run();

      const nextExecutionTime =
        scheduledTriggerManager.getNextExecutionTime(workspaceId);

      console.log(`Workspace execution completed successfully`);
      console.log(
        ` Next execution time: ${
          nextExecutionTime
            ? new Date(nextExecutionTime).toISOString()
            : "null"
        }`
      );

      broadcast({
        type: "trigger_execution",
        workspaceId,
        data: {
          success: true,
          nextExecutionTime,
          executedAt: Date.now(),
        },
      });
    } catch (error) {
      console.error(` Error executing workspace ${workspaceId}:`, error);

      const nextExecutionTime =
        scheduledTriggerManager.getNextExecutionTime(workspaceId);

      console.log(
        ` Next execution time after error: ${
          nextExecutionTime
            ? new Date(nextExecutionTime).toISOString()
            : "null"
        }`
      );

      broadcast({
        type: "trigger_execution",
        workspaceId,
        data: {
          success: false,
          message: String(error),
          nextExecutionTime,
        },
      });
    }
  });
  // WEBHOOK TRIGGER LOGIC (uses queue via directExecute)
  webhookTriggerManager.setExecutionCallback(
    async (workspaceId: string, payload: any) => {
      console.log(` Executing workspace ${workspaceId} via webhook`);
      console.log(`   Payload:`, payload);

      const workspaceDataStr = workspaceDataCache.get(workspaceId);

      if (!workspaceDataStr) {
        console.error(` No workspace data found for ${workspaceId}`);
        return;
      }

      try {
        broadcast({
          type: "message",
          data: {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            type: "system",
            message: ` Workspace triggered by webhook: ${workspaceId}`,
          },
          timestamp: new Date().toISOString(),
        });

        const listeners: Record<string, Function[]> = {};

        const mockWs = {
          send: async (msg: string) => {
            try {
              const data = JSON.parse(msg);

              const isWorkflowRequest =
                data.type === "run_workflow" ||
                (data.data &&
                  typeof data.data === "string" &&
                  data.data.includes('"nodes"')) ||
                (data.data &&
                  typeof data.data === "string" &&
                  data.data.includes("wf-"));

              if (isWorkflowRequest) {
                console.log(
                  " [MockWS] Intercepting background workflow execution..."
                );

                let workflow = data.data;
                let workflowId = data.id || data.requestId;

                if (typeof workflow === "string") {
                  try {
                    workflow = JSON.parse(workflow);
                  } catch (e) {}
                }
                if (workflow.workflow) workflow = workflow.workflow;
                else if (workflow.data) workflow = workflow.data;

                if (
                  typeof data.data === "string" &&
                  !data.data.startsWith("{")
                ) {
                  const targetId = data.data;
                  const wsData: WorkspaceData =
                    JSON.parse(workspaceDataStr);
                  const foundWf = wsData.workflows.find(
                    (w: any) => w.id === targetId
                  );
                  if (foundWf) {
                    workflow = foundWf;
                  }
                }

                if (
                  (!workflow.nodes || !Array.isArray(workflow.nodes)) &&
                  workflow.id
                ) {
                  const basePath = workspacePathsCache.get(workspaceId);
                  if (basePath) {
                    const flowsPath = path.join(
                      basePath,
                      "flows",
                      `${workflow.id}.json`
                    );
                    const rootNamePath = workflow.name
                      ? path.join(basePath, `${workflow.name}.json`)
                      : null;
                    let fullPath =
                      fs.existsSync(flowsPath) && flowsPath
                        ? flowsPath
                        : rootNamePath && fs.existsSync(rootNamePath)
                        ? rootNamePath
                        : null;

                    if (fullPath) {
                      try {
                        const fileContent = fs.readFileSync(
                          fullPath,
                          "utf-8"
                        );
                        const graphData = JSON.parse(fileContent);

                        let nodes = graphData.nodes;
                        let connections = graphData.connections;
                        if (graphData.canvasState) {
                          nodes = graphData.canvasState.nodes;
                          connections = graphData.canvasState.connections;
                        }

                        if (nodes) {
                          workflow.nodes = nodes;
                          workflow.connections = connections || [];
                          console.log(
                            `[MockWS] Hydrated '${
                              workflow.name || workflow.id
                            }' from disk! Nodes: ${workflow.nodes.length}`
                          );
                        }
                      } catch (err) {
                        console.error(
                          ` Error [MockWS] Disk read failed:`,
                          err
                        );
                      }
                    }
                  }
                }

                if (
                  !workflow.nodes ||
                  !Array.isArray(workflow.nodes) ||
                  workflow.nodes.length === 0
                ) {
                  console.error(
                    " [MockWS] ABORTING: Workflow has no nodes."
                  );
                  return;
                }

                try {
                  console.log(` [MockWS] Starting execution...`);

                  const context = JSON.stringify(payload);
                  const result = await executeFlowRuntime(
                    workflow,
                    mockWs as any,
                    context
                  );

                  console.log(` [MockWS] Execution finished.`);

                  const responseEvent = {
                    type: "workflow_json",
                    id: workflowId,
                    data: result,
                    timestamp: new Date().toISOString(),
                  };

                  if (listeners["message"]) {
                    const rawEvent = {
                      toString: () => JSON.stringify(responseEvent),
                    };
                    listeners["message"].forEach((cb) => cb(rawEvent));
                  }
                } catch (execError) {
                  console.error(
                    " [MockWS] Execution Error:",
                    execError
                  );
                  if (listeners["message"]) {
                    const errorEvent = {
                      type: "error",
                      requestId: workflowId,
                      message: String(execError),
                    };
                    const rawEvent = {
                      toString: () => JSON.stringify(errorEvent),
                    };
                    listeners["message"].forEach((cb) => cb(rawEvent));
                  }
                }
                return;
              }

              broadcast(data);
            } catch (e) {
              console.error(
                "Failed to broadcast/intercept message:",
                e
              );
            }
          },
          on: (event: string, callback: Function) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(callback);
          },
          off: (event: string, callback: Function) => {
            if (!listeners[event]) return;
            listeners[event] = listeners[event].filter(
              (cb) => cb !== callback
            );
          },
          removeListener: (event: string, callback: Function) => {
            if (!listeners[event]) return;
            listeners[event] = listeners[event].filter(
              (cb) => cb !== callback
            );
          },
          once: (event: string, callback: Function) => {
            const onceWrapper = (...args: any[]) => {
              callback(...args);
              if (listeners[event])
                listeners[event] = listeners[event].filter(
                  (cb) => cb !== onceWrapper
                );
            };
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(onceWrapper);
          },
          emit: (event: string, ...args: any[]) => {
            if (listeners[event])
              listeners[event].forEach((cb) => cb(...args));
          },
          readyState: 1,
          close: () => {},
          terminate: () => {},
        } as unknown as WebSocket;

        const workspaceAgent = createMainAgent(workspaceDataStr, mockWs);
        await workspaceAgent.run();

        console.log(` Webhook execution completed successfully`);

        broadcast({
          type: "webhook_execution",
          workspaceId,
          data: {
            success: true,
            executedAt: Date.now(),
            payload,
          },
        });
      } catch (error) {
        console.error(
          ` Error executing workspace ${workspaceId} via webhook:`,
          error
        );

        broadcast({
          type: "webhook_execution",
          workspaceId,
          data: {
            success: false,
            message: String(error),
          },
        });
      }
    }
  );

  // TELEGRAM TRIGGER LOGIC (uses queue via directExecute)
  telegramTriggerManager.setExecutionCallback(
    async (workspaceId: string, update: any) => {
      console.log(` Executing workspace ${workspaceId} via Telegram`);
      console.log(`   Update type:`, Object.keys(update).filter(k => k !== 'update_id'));

      const workspaceDataStr = workspaceDataCache.get(workspaceId);

      if (!workspaceDataStr) {
        console.error(` No workspace data found for ${workspaceId}`);
        broadcast({
          type: 'telegram_execution',
          workspaceId,
          data: {
            success: false,
            message: 'Workspace data not found'
          }
        });
        return;
      }

      try {
        broadcast({
          type: "message",
          data: {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            type: "system",
            message: ` Workspace triggered by Telegram: ${workspaceId}`,
          },
          timestamp: new Date().toISOString(),
        });

        const listeners: Record<string, Function[]> = {};

        const mockWs = {
          send: async (msg: string) => {
            try {
              const data = JSON.parse(msg);

              const isWorkflowRequest =
                data.type === "run_workflow" ||
                (data.data &&
                  typeof data.data === "string" &&
                  data.data.includes('"nodes"')) ||
                (data.data &&
                  typeof data.data === "string" &&
                  data.data.includes("wf-"));

              if (isWorkflowRequest) {
                console.log(
                  " [MockWS] Intercepting Telegram-triggered workflow execution..."
                );

                let workflow = data.data;
                let workflowId = data.id || data.requestId;

                if (typeof workflow === "string") {
                  try {
                    workflow = JSON.parse(workflow);
                  } catch (e) {}
                }
                if (workflow.workflow) workflow = workflow.workflow;
                else if (workflow.data) workflow = workflow.data;

                if (
                  typeof data.data === "string" &&
                  !data.data.startsWith("{")
                ) {
                  const targetId = data.data;
                  const wsData: WorkspaceData = JSON.parse(workspaceDataStr);
                  const foundWf = wsData.workflows.find(
                    (w: any) => w.id === targetId
                  );
                  if (foundWf) {
                    workflow = foundWf;
                  }
                }

                if (
                  (!workflow.nodes || !Array.isArray(workflow.nodes)) &&
                  workflow.id
                ) {
                  const basePath = workspacePathsCache.get(workspaceId);
                  if (basePath) {
                    const flowsPath = path.join(
                      basePath,
                      "flows",
                      `${workflow.id}.json`
                    );
                    const rootNamePath = workflow.name
                      ? path.join(basePath, `${workflow.name}.json`)
                      : null;
                    let fullPath =
                      fs.existsSync(flowsPath) && flowsPath
                        ? flowsPath
                        : rootNamePath && fs.existsSync(rootNamePath)
                        ? rootNamePath
                        : null;

                    if (fullPath) {
                      try {
                        const fileContent = fs.readFileSync(fullPath, "utf-8");
                        const graphData = JSON.parse(fileContent);

                        let nodes = graphData.nodes;
                        let connections = graphData.connections;
                        if (graphData.canvasState) {
                          nodes = graphData.canvasState.nodes;
                          connections = graphData.canvasState.connections;
                        }

                        if (nodes) {
                          workflow.nodes = nodes;
                          workflow.connections = connections || [];
                          console.log(
                            ` [MockWS] Hydrated '${
                              workflow.name || workflow.id
                            }' from disk! Nodes: ${workflow.nodes.length}`
                          );
                        }
                      } catch (err) {
                        console.error(` [MockWS] Disk read failed:`, err);
                      }
                    }
                  }
                }

                if (
                  !workflow.nodes ||
                  !Array.isArray(workflow.nodes) ||
                  workflow.nodes.length === 0
                ) {
                  console.error(
                    " [MockWS] ABORTING: Workflow has no nodes."
                  );
                  return;
                }

                try {
                  console.log(` [MockWS] Starting Telegram-triggered execution...`);

                  const context = JSON.stringify(update);
                  const result = await executeFlowRuntime(
                    workflow,
                    mockWs as any,
                    context
                  );

                  console.log(` [MockWS] Execution finished.`);

                  const responseEvent = {
                    type: "workflow_json",
                    id: workflowId,
                    data: result,
                    timestamp: new Date().toISOString(),
                  };

                  if (listeners["message"]) {
                    const rawEvent = {
                      toString: () => JSON.stringify(responseEvent),
                    };
                    listeners["message"].forEach((cb) => cb(rawEvent));
                  }
                } catch (execError) {
                  console.error(" [MockWS] Execution Error:", execError);
                  if (listeners["message"]) {
                    const errorEvent = {
                      type: "error",
                      requestId: workflowId,
                      message: String(execError),
                    };
                    const rawEvent = {
                      toString: () => JSON.stringify(errorEvent),
                    };
                    listeners["message"].forEach((cb) => cb(rawEvent));
                  }
                }
                return;
              }

              broadcast(data);
            } catch (e) {
              console.error(
                "Failed to broadcast/intercept Telegram message:",
                e
              );
            }
          },
          on: (event: string, callback: Function) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(callback);
          },
          off: (event: string, callback: Function) => {
            if (!listeners[event]) return;
            listeners[event] = listeners[event].filter(
              (cb) => cb !== callback
            );
          },
          removeListener: (event: string, callback: Function) => {
            if (!listeners[event]) return;
            listeners[event] = listeners[event].filter(
              (cb) => cb !== callback
            );
          },
          once: (event: string, callback: Function) => {
            const onceWrapper = (...args: any[]) => {
              callback(...args);
              if (listeners[event])
                listeners[event] = listeners[event].filter(
                  (cb) => cb !== onceWrapper
                );
            };
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(onceWrapper);
          },
          emit: (event: string, ...args: any[]) => {
            if (listeners[event])
              listeners[event].forEach((cb) => cb(...args));
          },
          readyState: 1,
          close: () => {},
          terminate: () => {},
        } as unknown as WebSocket;

        const workspaceAgent = createMainAgent(workspaceDataStr, mockWs);
        await workspaceAgent.run();

        console.log(` Telegram execution completed successfully`);

        broadcast({
          type: "telegram_execution",
          workspaceId,
          data: {
            success: true,
            executedAt: Date.now(),
            update,
          },
        });
      } catch (error) {
        console.error(
          ` Error executing Telegram workspace ${workspaceId}:`,
          error
        );

        broadcast({
          type: "telegram_execution",
          workspaceId,
          data: {
            success: false,
            message: String(error),
          },
        });
      }
    }
  );

  // MAIN CLIENT CONNECTION HANDLER

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    console.log(
      "New WebSocket connection established:",
      req.socket.remoteAddress
    );
    clients.add(ws);

     // Handle incoming messages from frontend
    ws.on("message", async (message: WebSocket.RawData) => {
      try {
        const data = JSON.parse(message.toString());
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
            let payload;
            if (typeof data.data === 'string') {
              try {
                payload = JSON.parse(data.data);
              } catch (e) {
                payload = data.data;
              }
            } else {
              payload = data.data;
            }
            
            const { promptId, response } = payload;
            
            console.log(`[SERVER STDOUT]  PromptID: ${promptId}, Response: "${response}"`);
            
            if (!promptId) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Missing promptId in user prompt response",
                  timestamp: new Date().toISOString(),
                })
              );
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
              
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Failed to resolve prompt - prompt not found or already resolved",
                  promptId,
                  timestamp: new Date().toISOString(),
                })
              );
            }
            break;
          }

          case "register_trigger": {
            console.log(`[SERVER STDOUT] Register trigger request`);

            if (!data.data) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Missing trigger data",
                  timestamp: new Date().toISOString(),
                })
              );
              break;
            }

            const payload = JSON.parse(data.data);
            const { workspaceId, trigger, workspaceData, baseWorkflowsPath } =
              payload;

            if (!workspaceId || !trigger) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Missing workspaceId or trigger",
                  timestamp: new Date().toISOString(),
                })
              );
              break;
            }

            if (baseWorkflowsPath) {
              workspacePathsCache.set(workspaceId, baseWorkflowsPath);
              console.log(
                `[SERVER STDOUT]  Cached workflows path: ${baseWorkflowsPath}`
              );
            }

            // SCHEDULED TRIGGER
            if (trigger.type === "scheduled") {
              console.log(
                `[SERVER STDOUT] ⏰ Registering SCHEDULED trigger for: ${workspaceId}`
              );

              if (
                !trigger.config ||
                !trigger.config.cronExpression
              ) {
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message:
                      "Missing cronExpression in scheduled trigger",
                    timestamp: new Date().toISOString(),
                  })
                );
                break;
              }

              if (workspaceData) {
                const hydratedData = hydrateWorkspaceData(
                  workspaceId,
                  workspaceData,
                  baseWorkflowsPath
                );
                workspaceDataCache.set(
                  workspaceId,
                  JSON.stringify(hydratedData)
                );
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
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message: `Failed to register scheduled trigger: ${error}`,
                    timestamp: new Date().toISOString(),
                  })
                );
              }
            }
            // WEBHOOK TRIGGER
            else if (trigger.type === "webhook") {
              console.log(
                `[SERVER STDOUT] 🔗 Registering WEBHOOK trigger for: ${workspaceId}`
              );

              if (workspaceData) {
                const hydratedData = hydrateWorkspaceData(
                  workspaceId,
                  workspaceData,
                  baseWorkflowsPath
                );
                workspaceDataCache.set(
                  workspaceId,
                  JSON.stringify(hydratedData)
                );
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
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message: `Failed to register webhook trigger: ${error}`,
                    timestamp: new Date().toISOString(),
                  })
                );
              }
            }
            // TELEGRAM TRIGGER
            else if (trigger.type === "telegram") {
              console.log(
                `[SERVER STDOUT] 📱 Registering TELEGRAM trigger for: ${workspaceId}`
              );

              if (!trigger.config || !trigger.config.botToken) {
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message: "Missing bot token in Telegram trigger",
                    timestamp: new Date().toISOString(),
                  })
                );
                break;
              }

              if (!trigger.config.updateTypes || trigger.config.updateTypes.length === 0) {
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message: "At least one update type must be selected",
                    timestamp: new Date().toISOString(),
                  })
                );
                break;
              }

              if (workspaceData) {
                const hydratedData = hydrateWorkspaceData(
                  workspaceId,
                  workspaceData,
                  baseWorkflowsPath
                );
                workspaceDataCache.set(
                  workspaceId,
                  JSON.stringify(hydratedData)
                );
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
                );
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message: `Failed to register Telegram trigger: ${error}`,
                    timestamp: new Date().toISOString(),
                  })
                );
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
              );
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: `Unknown trigger type: ${trigger.type}`,
                  timestamp: new Date().toISOString(),
                })
              );
            }
            break;
          }

          case "unregister_trigger": {
            console.log(`[SERVER STDOUT]  Unregister trigger request`);

            const workspaceId = data.workspaceId;

            if (!workspaceId) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Missing workspaceId",
                  timestamp: new Date().toISOString(),
                })
              );
              break;
            }

            scheduledTriggerManager.unregisterTrigger(workspaceId);
            webhookTriggerManager.unregisterWorkspaceWebhooks(workspaceId);
            await telegramTriggerManager.unregisterTelegramBot(workspaceId);

            workspaceDataCache.delete(workspaceId);
            workspacePathsCache.delete(workspaceId);

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

          case "run_workspace":
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

            currentWorkspaceAgent = createMainAgent(data.data, ws);
            await currentWorkspaceAgent.run();
            break;

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

            const workflow = JSON.parse(data.data);
            const result = await executeFlowRuntime(workflow, ws);

            ws.send(
              JSON.stringify({
                id: workflow.id,
                type: "workflow_result",
                data: result,
                timestamp: new Date().toISOString(),
              })
            );
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
                  ws.send(
                    JSON.stringify({
                      type: "error",
                      message:
                        "Failed to resolve prompt - prompt not found or already resolved",
                      promptId,
                      timestamp: new Date().toISOString(),
                    })
                  );
                }
              } else {
                console.warn("Console input missing promptId or message");
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message:
                      "Invalid console input format - missing promptId or message",
                    timestamp: new Date().toISOString(),
                  })
                );
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
