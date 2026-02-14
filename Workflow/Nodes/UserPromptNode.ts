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

interface PendingUserPrompt {
  promptId: string;
  nodeId: number;
  timestamp: number;
  resolved: boolean;
  response?: string;
}

const pendingUserPrompts = new Map<string, PendingUserPrompt>();

export const resolveUserPrompt = (promptId: string, response: string): boolean => {
  const prompt = pendingUserPrompts.get(promptId);
  if (prompt && !prompt.resolved) {
    prompt.resolved = true;
    prompt.response = response;
    return true;
  }
  return false;
};

export const getUserPromptResponse = (promptId: string): string | null => {
  const prompt = pendingUserPrompts.get(promptId);
  if (!prompt || !prompt.resolved) {
    return null;
  }
  return prompt.response ?? "";
};

export const registerUserPrompt = (promptId: string, nodeId: number): void => {
  pendingUserPrompts.set(promptId, {
    promptId,
    nodeId,
    timestamp: Date.now(),
    resolved: false,
  });
};

export const cleanupUserPrompts = (maxAge: number = 300000): void => {
  const now = Date.now();
  for (const [promptId, prompt] of pendingUserPrompts.entries()) {
    if (now - prompt.timestamp > maxAge) {
      pendingUserPrompts.delete(promptId);
    }
  }
};

export interface UserPromptNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "Input/Output",
  title: "User Prompt",
  nodeType: "UserPrompt",
  description: "Displays a popup dialog in the frontend to collect user input during workflow execution. Pauses execution until user provides input or timeout occurs.",
  nodeValue: "",
  sockets: [
    { title: "Title", type: "input", dataType: "string" },
    { title: "Message", type: "input", dataType: "string" },
    { title: "Response", type: "output", dataType: "string" },
  ],
  width: 320,
  height: 180,
  configParameters: [
    {
      parameterName: "Dialog Title",
      parameterType: "string",
      defaultValue: "User Input Required",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Title shown in the popup dialog",
      i18n: {
        en: {
          "Dialog Title": {
            Name: "Dialog Title",
            Description: "Title shown in the popup dialog",
          },
        },
        ar: {
          "Dialog Title": {
            Name: "عنوان الحوار",
            Description: "العنوان المعروض في نافذة الحوار",
          },
        },
      },
    },
    {
      parameterName: "Prompt Message",
      parameterType: "text",
      defaultValue: "Please enter your input:",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Message/question to display to the user",
      i18n: {
        en: {
          "Prompt Message": {
            Name: "Prompt Message",
            Description: "Message/question to display to the user",
          },
        },
        ar: {
          "Prompt Message": {
            Name: "رسالة الطلب",
            Description: "الرسالة/السؤال المعروض للمستخدم",
          },
        },
      },
    },
    {
      parameterName: "Timeout (seconds)",
      parameterType: "number",
      defaultValue: 300,
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
  i18n: {
    en: {
      category: "Input/Output",
      title: "User Prompt",
      nodeType: "User Prompt",
      description: "Displays a popup dialog in the frontend to collect user input during workflow execution. Pauses execution until user provides input or timeout occurs.",
    },
    ar: {
      category: "إدخال/إخراج",
      title: "طلب من المستخدم",
      nodeType: "طلب من المستخدم",
      description: "يعرض نافذة منبثقة في الواجهة الأمامية لجمع إدخال المستخدم أثناء تنفيذ سير العمل. يوقف التنفيذ حتى يقدم المستخدم الإدخال أو تنتهي المهلة.",
    },
  },
};

function createUserPromptNode(id: number, position: Position): UserPromptNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: [
      {
        id: id * 100 + 1,
        title: "Title",
        type: "input",
        nodeId: id,
        dataType: "string",
      },
      {
        id: id * 100 + 2,
        title: "Message",
        type: "input",
        nodeId: id,
        dataType: "string",
      },
      {
        id: id * 100 + 3,
        title: "Response",
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
      const n = context.node as UserPromptNode;

      // Get dialog title from input socket or config
      let dialogTitle: string;
      const titleInput = context.inputs[id * 100 + 1];
      if (titleInput !== undefined && titleInput !== null) {
        dialogTitle = typeof titleInput === 'string' ? titleInput : String(titleInput);
      } else {
        dialogTitle = (n.getConfigParameter?.("Dialog Title")?.paramValue as string) || "User Input Required";
      }

      // Get prompt message from input socket or config
      let promptMessage: string;
      const messageInput = context.inputs[id * 100 + 2];
      if (messageInput !== undefined && messageInput !== null) {
        promptMessage = typeof messageInput === 'string' ? messageInput : String(messageInput);
      } else {
        promptMessage = (n.getConfigParameter?.("Prompt Message")?.paramValue as string) || "Please enter your input:";
      }

      // Get timeout config
      const timeoutSeconds = (n.getConfigParameter?.("Timeout (seconds)")?.paramValue as number) || 300;

      const executionStartTime = Date.now();
      const promptId = `user_prompt_${executionStartTime}_${Math.random().toString(36).slice(2, 9)}`;
      
      console.log(`🔵 UserPrompt Node ${n.id}: Registering prompt ${promptId}`);
      registerUserPrompt(promptId, n.id);

      // Send prompt request to frontend
      const promptData = {
        promptId,
        nodeId: n.id,
        message: promptMessage,
      };

      if (context.ws) {
        console.log(`📤 Sending user_prompt_request to frontend:`, promptData);
        context.ws.send(
          JSON.stringify({
            type: "user_prompt_request",
            data: promptData,
            timestamp: new Date().toISOString(),
          })
        );
      } else {
        console.error("❌ WebSocket not available in context!");
        return "Error: WebSocket not available";
      }

      // Wait for user response with Promise
      return new Promise<string>((resolve, reject) => {
        const startTime = Date.now();
        
        const checkInterval = setInterval(() => {
          // Check for timeout
          if (timeoutSeconds > 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed >= timeoutSeconds) {
              clearInterval(checkInterval);
              pendingUserPrompts.delete(promptId);
              
              console.error(`⏱️ User prompt ${promptId} timed out after ${timeoutSeconds}s`);
              
              if (context.ws) {
                context.ws.send(
                  JSON.stringify({
                    type: "user_prompt_timeout",
                    data: { promptId },
                    timestamp: new Date().toISOString(),
                  })
                );
              }
              
              reject(new Error(`User prompt timeout after ${timeoutSeconds} seconds`));
              return;
            }
          }

          // Check for response
          const response = getUserPromptResponse(promptId);
          if (response !== null) {
            clearInterval(checkInterval);
            pendingUserPrompts.delete(promptId);
            
            console.log(`✅ User prompt ${promptId} resolved with response: "${response}"`);
            
            if (context.ws) {
              context.ws.send(
                JSON.stringify({
                  type: "user_prompt_resolved",
                  data: { promptId, response },
                  timestamp: new Date().toISOString(),
                })
              );
            }
            
            resolve(response);
          }
        }, 100); 
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

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType("UserPrompt", createUserPromptNode, metadata);
}
