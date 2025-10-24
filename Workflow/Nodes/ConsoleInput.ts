/*
 * yaLLMa3 - Framework for building AI agents that are capable of learning from their environment and interacting with it.
 *
 * Copyright (C) 2025 yaLLMa3
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at https://www.mozilla.org/MPL/2.0/.
 *
 * This software is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied.
 */

import type {
  BaseNode,
  Position,
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  NodeMetadata,
} from "../types/types";
import { NodeRegistry } from "../NodeRegistry";
import type { ConsoleEvent } from "../../Models/Workspace";

let globalConsoleEvents: ConsoleEvent[] = [];

// Track pending prompts with their associated node IDs
interface PendingPrompt {
  promptId: string;
  nodeId: number;
  timestamp: number;
  resolved: boolean;
  response?: string;
}

const pendingPrompts = new Map<string, PendingPrompt>();

export const setConsoleEvents = (events: ConsoleEvent[]) => {
  globalConsoleEvents = [...events];
};

export const addConsoleEvent = (event: ConsoleEvent) => {
  globalConsoleEvents = [event, ...globalConsoleEvents].slice(0, 100);
};

// New: Get input for a specific prompt ID
export const getInputForPrompt = (promptId: string): string | null => {
  const prompt = pendingPrompts.get(promptId);
  if (prompt && prompt.resolved && prompt.response) {
    return prompt.response;
  }
  return null;
};

// New: Resolve a prompt with user input
export const resolvePrompt = (promptId: string, response: string): boolean => {
  const prompt = pendingPrompts.get(promptId);
  if (prompt && !prompt.resolved) {
    prompt.resolved = true;
    prompt.response = response;
    return true;
  }
  return false;
};

// New: Register a new pending prompt
export const registerPrompt = (promptId: string, nodeId: number): void => {
  pendingPrompts.set(promptId, {
    promptId,
    nodeId,
    timestamp: Date.now(),
    resolved: false,
  });
};

// New: Clean up old/timed out prompts
export const cleanupPrompts = (maxAge: number = 300000): void => {
  const now = Date.now();
  for (const [promptId, prompt] of pendingPrompts.entries()) {
    if (now - prompt.timestamp > maxAge) {
      pendingPrompts.delete(promptId);
    }
  }
};

// New: Get all pending (unresolved) prompts
export const getPendingPrompts = (): PendingPrompt[] => {
  return Array.from(pendingPrompts.values()).filter(p => !p.resolved);
};

export const getLastUserInputAfter = (
  afterTimestamp: number
): string | null => {
  const userInputEvent = globalConsoleEvents.find(
    (event) =>
      event.details === "User input" && event.timestamp > afterTimestamp
  );

  return userInputEvent ? userInputEvent.message : null;
};

export const ConsoleInputUtils = {
  updateEvents: (events: ConsoleEvent[]) => {
    setConsoleEvents(events);
  },

  addEvent: (event: ConsoleEvent) => {
    addConsoleEvent(event);
  },

  getCurrentEvents: () => {
    return [...globalConsoleEvents];
  },

  clearEvents: () => {
    globalConsoleEvents = [];
  },

  // New utility methods
  resolvePrompt: (promptId: string, response: string) => {
    return resolvePrompt(promptId, response);
  },

  getPendingPrompts: () => {
    return getPendingPrompts();
  },

  cleanupPrompts: (maxAge?: number) => {
    cleanupPrompts(maxAge);
  },
};

export interface ConsoleInputNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

export function register(nodeRegistry: NodeRegistry): void {
  const metadata: NodeMetadata = {
    category: "Input",
    title: "Console Input",
    nodeType: "ConsoleInput",
    description: "An interactive node that prompts for user input in the console. Features include customizable and internationalized prompt messages, a configurable timeout, and a comprehensive event system to track the input lifecycle from request to resolution or timeout.",
    nodeValue: "",
    sockets: [
      { title: "Prompt", type: "input", dataType: "string" },
      { title: "Message", type: "output", dataType: "string" },
    ],
    width: 320,
    height: 150,
    configParameters: [
      {
        parameterName: "Prompt Message",
        parameterType: "string",
        defaultValue: "Please enter your input:",
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Message to display when requesting input",
        i18n: {
          en: {
            "Prompt Message": {
              Name: "Prompt Message",
              Description: "Message to display when requesting input",
            },
          },
          ar: {
            "Prompt Message": {
              Name: "رسالة الطلب",
              Description: "الرسالة التي سيتم عرضها عند طلب الإدخال",
            },
          },
        },
      },
      {
        parameterName: "Timeout (seconds)",
        parameterType: "number",
        defaultValue: 120,
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Maximum time to wait for input (0 = no timeout)",
        i18n: {
          en: {
            "Timeout (seconds)": {
              Name: "Timeout (seconds)",
              Description: "Maximum time to wait for input (0 = no timeout)",
            },
          },
          ar: {
            "Timeout (seconds)": {
              Name: "المهلة (بالثواني)",
              Description: "الحد الأقصى للوقت لانتظار الإدخال (0 = بدون مهلة)",
            },
          },
        },
      },
    ],
  };

  function createConsoleInputNode(
    id: number,
    position: Position
  ): ConsoleInputNode {
    return {
      id,
      category: metadata.category,
      title: metadata.title,
      nodeValue: metadata.nodeValue,
      nodeType: metadata.nodeType,
      sockets: [
        {
          id: id * 100 + 1,
          title: "Prompt",
          type: "input",
          nodeId: id,
          dataType: "string",
        },
        {
          id: id * 100 + 2,
          title: "Message",
          type: "output",
          nodeId: id,
          dataType: "string",
        },
      ],
      x: position.x,
      y: position.y,
      width: metadata.width,
      height: metadata.height,
      selected: false,
      processing: false,
      process: async (context: NodeExecutionContext) => {
        const n = context.node as ConsoleInputNode;

        let prompt: string;

        if (context.inputs[id * 100 + 1]) {
          prompt = context.inputs[id * 100 + 1];
        } else {
          prompt =
            (n.getConfigParameter?.("Prompt Message")?.paramValue as string) ||
            "Please enter your input";
        }

        const timeoutParam = n.getConfigParameter?.("Timeout (seconds)");
        const timeoutSeconds = (timeoutParam?.paramValue as number) || 30;
        const executionStartTime = Date.now();

        // Generate unique prompt ID
        const promptId = `prompt_${executionStartTime}_${Math.random().toString(36).slice(2, 9)}`;

        // Register this prompt
        registerPrompt(promptId, n.id);

        const promptEvent = {
          id: promptId,
          timestamp: executionStartTime,
          type: "input" as const,
          message: prompt,
          details: "Waiting for user input",
          nodeId: n.id,
          nodeName: n.title,
          promptId: promptId,
        };

        // Only add to console if not already added
        const existingEvent = globalConsoleEvents.find(e => e.id === promptId);
        if (!existingEvent) {
          addConsoleEvent(promptEvent);
        }

        if (context.ws) {
          context.ws.send(
            JSON.stringify({
              type: "console_prompt",
              data: promptEvent,
              timestamp: new Date().toISOString(),
            })
          );
        }

        return new Promise<string>((resolve, reject) => {
          const checkInterval = setInterval(() => {
            // Check for timeout
            if (timeoutSeconds > 0) {
              const elapsed = (Date.now() - executionStartTime) / 1000;
              if (elapsed >= timeoutSeconds) {
                clearInterval(checkInterval);
                
                // Clean up prompt
                pendingPrompts.delete(promptId);

                const timeoutEvent = {
                  id: Date.now().toString() + Math.random().toString(36).slice(2, 9),
                  timestamp: Date.now(),
                  type: "error" as const,
                  message: `Input timeout after ${timeoutSeconds} seconds`,
                  details: `Node ${n.id} - ${n.title} timed out`,
                  promptId: promptId,
                };

                addConsoleEvent(timeoutEvent);

                if (context.ws) {
                  context.ws.send(
                    JSON.stringify({
                      type: "console_event",
                      data: timeoutEvent,
                      timestamp: new Date().toISOString(),
                    })
                  );
                }

                reject(new Error(`Input timeout after ${timeoutSeconds} seconds`));
                return;
              }
            }

            // Check if this specific prompt has been resolved
            const response = getInputForPrompt(promptId);
            if (response) {
              clearInterval(checkInterval);
              
              // Clean up prompt
              pendingPrompts.delete(promptId);

              const successEvent = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                timestamp: Date.now(),
                type: "success" as const,
                message: `Input received: "${response}"`,
                details: `Node ${n.id} - ${n.title}`,
                promptId: promptId,
              };

              addConsoleEvent(successEvent);

              if (context.ws) {
                context.ws.send(
                  JSON.stringify({
                    type: "console_event",
                    data: successEvent,
                    timestamp: new Date().toISOString(),
                  })
                );
              }

              resolve(response);
            }
          }, 500);
        });
      },
      configParameters: metadata.configParameters,

      getConfigParameters: function (): ConfigParameterType[] {
        return this.configParameters || [];
      },
      getConfigParameter(parameterName) {
        const parameter = (this.configParameters ?? []).find(
          (param) => param.parameterName === parameterName
        );
        return parameter;
      },
      setConfigParameter(parameterName, value) {
        const parameter = (this.configParameters ?? []).find(
          (param) => param.parameterName === parameterName
        );
        if (parameter) {
          parameter.paramValue = value;
        }
      },
    };
  }

  nodeRegistry.registerNodeType(
    "ConsoleInput",
    createConsoleInputNode,
    metadata
  );
}