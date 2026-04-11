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

export const cancelUserPrompt = (promptId: string): boolean => {
  const prompt = pendingUserPrompts.get(promptId);
  if (prompt && !prompt.resolved) {
    prompt.resolved = true;
    prompt.response = "__CANCELLED__";
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
  title: "User Input",
  nodeType: "UserPrompt",
  description: "Displays a popup dialog to collect user input. Connect User Input to Gemini's Prompt Loop for a chat loop, or to Prompt for a single call.",
  nodeValue: "",
  sockets: [
    { title: "Title",      type: "input",  dataType: "string" },
    { title: "Message",    type: "input",  dataType: "string" },
    { title: "User Input", type: "output", dataType: "string" },
  ],
  width: 320,
  height: 200,
  configParameters: [
    {
      parameterName: "Dialog Title",
      parameterType: "string",
      defaultValue: "User Input Required",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Title shown in the popup dialog",
      i18n: {
        en: { "Dialog Title": { Name: "Dialog Title", Description: "Title shown in the popup dialog" } },
        ar: { "Dialog Title": { Name: "عنوان الحوار", Description: "العنوان المعروض في نافذة الحوار" } },
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
        en: { "Prompt Message": { Name: "Prompt Message", Description: "Message/question to display to the user" } },
        ar: { "Prompt Message": { Name: "رسالة الطلب", Description: "الرسالة/السؤال المعروض للمستخدم" } },
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
        en: { "Timeout (seconds)": { Name: "Timeout (seconds)", Description: "Maximum time to wait for input (0 = no timeout)" } },
        ar: { "Timeout (seconds)": { Name: "المهلة (بالثواني)", Description: "الحد الأقصى للوقت لانتظار الإدخال (0 = بدون مهلة)" } },
      },
    },
    {
      parameterName: "Exit Keyword",
      parameterType: "string",
      defaultValue: "exit",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "User types this word to end the chat loop (case-insensitive). Leave empty to disable.",
      i18n: {
        en: { "Exit Keyword": { Name: "Exit Keyword", Description: "User types this to end the chat loop (e.g. exit, quit, bye)." } },
        ar: { "Exit Keyword": { Name: "كلمة الخروج", Description: "يكتبها المستخدم لإنهاء حلقة الدردشة." } },
      },
    },
  ],
  i18n: {
    en: {
      category: "Input/Output",
      title: "User Input",
      nodeType: "User Input",
      description: "Displays a popup dialog to collect user input during workflow execution.",
    },
    ar: {
      category: "إدخال/إخراج",
      title: "إدخال المستخدم",
      nodeType: "إدخال المستخدم",
      description: "يعرض نافذة منبثقة لجمع إدخال المستخدم أثناء تنفيذ سير العمل.",
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
      { id: id * 100 + 1, title: "Title",      type: "input",  nodeId: id, dataType: "string" },
      { id: id * 100 + 2, title: "Message",    type: "input",  nodeId: id, dataType: "string" },

      { id: id * 100 + 3, title: "User Input", type: "output", nodeId: id, dataType: "string" },
    ],
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    selected: false,
    processing: false,
    process: async (context: NodeExecutionContext) => {
      const n = context.node as UserPromptNode;

      // Get dialog title
      const titleInput = context.inputs[id * 100 + 1];
      let _dialogTitle: string;
      if (titleInput !== undefined && titleInput !== null) {
        _dialogTitle = typeof titleInput === "string" ? titleInput : String(titleInput);
      } else {
        _dialogTitle = (n.getConfigParameter?.("Dialog Title")?.paramValue as string) || "User Input Required";
      }

      // Get prompt message 
      const messageInput = context.inputs[id * 100 + 2];
      let promptMessage: string;
      if (messageInput !== undefined && messageInput !== null) {
        promptMessage = typeof messageInput === "string" ? messageInput : String(messageInput);
      } else {
        promptMessage = (n.getConfigParameter?.("Prompt Message")?.paramValue as string) || "Please enter your input:";
      }

      const timeoutSeconds = (n.getConfigParameter?.("Timeout (seconds)")?.paramValue as number) ?? 300;
      const exitKeyword = ((n.getConfigParameter?.("Exit Keyword")?.paramValue as string) ?? "exit").trim().toLowerCase();

      const executionStartTime = Date.now();
      const promptId = `user_prompt_${executionStartTime}_${Math.random().toString(36).slice(2, 9)}`;

      console.log(`🔵 UserInput Node ${n.id}: Registering prompt ${promptId}`);
      registerUserPrompt(promptId, n.id);

      const promptData = { promptId, nodeId: n.id, message: promptMessage };

      if (context.ws) {
        context.ws.send(JSON.stringify({
          type: "user_prompt_request",
          data: promptData,
          timestamp: new Date().toISOString(),
        }));
      } else {
        console.error("❌ WebSocket not available in context!");
        return "Error: WebSocket not available";
      }

      const userInput = await new Promise<string>((resolve, reject) => {
        const startTime = Date.now();
        let checkInterval: ReturnType<typeof setInterval>;

        const cleanup = () => {
          clearInterval(checkInterval);
          pendingUserPrompts.delete(promptId);
        };

        const handleWsDisconnect = () => {
          cleanup();
          if (context.ws) {
            context.ws.removeListener("close", handleWsDisconnect);
            context.ws.removeListener("error", handleWsDisconnect);
          }
          reject(new Error("WebSocket disconnected"));
        };

        if (context.ws) {
          context.ws.on("close", handleWsDisconnect);
          context.ws.on("error", handleWsDisconnect);
        }

        checkInterval = setInterval(() => {
          if (timeoutSeconds > 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed >= timeoutSeconds) {
              cleanup();
              if (context.ws) {
                context.ws.removeListener("close", handleWsDisconnect);
                context.ws.removeListener("error", handleWsDisconnect);
                context.ws.send(JSON.stringify({
                  type: "user_prompt_timeout",
                  data: { promptId },
                  timestamp: new Date().toISOString(),
                }));
              }
              reject(new Error(`User prompt timeout after ${timeoutSeconds} seconds`));
              return;
            }
          }

          const response = getUserPromptResponse(promptId);
          if (response !== null) {
            cleanup();
            console.log(`✅ UserInput ${promptId} resolved: "${response}"`);
            if (context.ws) {
              context.ws.removeListener("close", handleWsDisconnect);
              context.ws.removeListener("error", handleWsDisconnect);
              context.ws.send(JSON.stringify({
                type: "user_prompt_resolved",
                data: { promptId, response },
                timestamp: new Date().toISOString(),
              }));
            }
            resolve(response);
          }
        }, 100);
      });

      // ADDED: cancelled (X clicked) or exit keyword → return undefined to stop chat loop
      const isCancelled = userInput === "__CANCELLED__";
      const isExit = !isCancelled && exitKeyword && userInput.trim().toLowerCase() === exitKeyword;

      if (isCancelled || isExit) {
        return { [id * 100 + 3]: undefined };
      }

      return { [id * 100 + 3]: userInput };
    },
    configParameters: metadata.configParameters,
    getConfigParameters: function (): ConfigParameterType[] {
      return this.configParameters || [];
    },
    getConfigParameter(parameterName) {
      return (this.configParameters ?? []).find((p) => p.parameterName === parameterName);
    },
    setConfigParameter(parameterName, value) {
      const p = (this.configParameters ?? []).find((p) => p.parameterName === parameterName);
      if (p) p.paramValue = value;
    },
  };
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType("UserPrompt", createUserPromptNode, metadata);
}
