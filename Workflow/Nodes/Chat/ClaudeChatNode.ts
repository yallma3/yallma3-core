/*
* yaLLMa3 - Framework for building AI agents that are capable of learning from their environment and interacting with it.
 
 * Copyright (C) 2025 yaLLMa3
 
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
   If a copy of the MPL was not distributed with this file, You can obtain one at https://www.mozilla.org/MPL/2.0/.
 
 * This software is distributed on an "AS IS" basis,
   WITHOUT WARRANTY OF ANY KIND, either express or implied.
   See the Mozilla Public License for the specific language governing rights and limitations under the License.
*/

import type {
  BaseNode,
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  NodeMetadata,
  Position,
} from "../../types/types";
import { NodeRegistry } from "../../NodeRegistry";

export interface ChatNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
  _chatHistory: { role: "user" | "assistant"; content: string }[];
}
const metadata: NodeMetadata = {
  category: "AI",
  title: "Claude Chat",
  nodeType: "ClaudeChat",
  nodeValue: "claude-3-haiku-20240307",
  description:
    "Integrates with Anthropic's Claude API. Connect User Input to Prompt Loop for a multi-turn chat loop, or to Prompt for a single call.",
  sockets: [
    // ADDED: Prompt Loop — only accepts User Input socket connections
    { title: "Prompt Loop",   type: "input",  dataType: "string" },
    { title: "Prompt",        type: "input",  dataType: "string" },
    { title: "System Prompt", type: "input",  dataType: "string" },
    { title: "Response",      type: "output", dataType: "string" },
    { title: "Tokens",        type: "output", dataType: "string" },
  ],
  width: 380,
  height: 280,
  configParameters: [
    {
      parameterName: "Model",
      parameterType: "string",
      defaultValue: "claude-3-haiku-20240307",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Model name to use for the chat node",
      isNodeBodyContent: true,
      sourceList: [
        { key: "claude-3-haiku-20240307",    label: "Claude 3 Haiku"       },
        { key: "claude-3-sonnet-20240229",   label: "Claude 3 Sonnet"      },
        { key: "claude-3-opus-20240229",     label: "Claude 3 Opus"        },
        { key: "claude-3-5-sonnet-20240620", label: "Claude 3.5 Sonnet"    },
        { key: "claude-sonnet-4-20250514",   label: "Claude Sonnet 4"      },
        { key: "claude-opus-4-20250514",     label: "Claude Opus 4"        },
      ],
      i18n: {
        en: { "Model": { Name: "Model", Description: "Model name to use for the chat node" } },
        ar: { "Model": { Name: "النموذج", Description: "اسم النموذج المراد استخدامه لعقدة المحادثة" } },
      },
    },
    {
      parameterName: "API Key",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "API Key for the Claude service",
      isNodeBodyContent: false,
      i18n: {
        en: { "API Key": { Name: "API Key", Description: "API Key for the Claude service" } },
        ar: { "API Key": { Name: "مفتاح API", Description: "مفتاح API لخدمة Claude" } },
      },
    },
  ],
  i18n: {
    en: {
      category: "AI",
      title: "Claude Chat",
      nodeType: "Claude Chat",
      description:
        "Integrates with Anthropic's Claude API for chat completions. Supports single-turn and multi-turn loop mode.",
    },
    ar: {
      category: "ذكاء اصطناعي",
      title: "محادثة Claude",
      nodeType: "محادثة Claude",
      description:
        "يتكامل مع واجهة Claude API من Anthropic لإتمام المحادثات. يدعم الوضع الأحادي ووضع الحلقة متعددة الأدوار.",
    },
  },
};

export function createNClaudeChatNode(id: number, position: Position): ChatNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    // ADDED: empty chat history — persists across loop turns
    _chatHistory: [],
    sockets: [
      // ADDED: Prompt Loop socket (id * 100 + 1)
      { id: id * 100 + 1, title: "Prompt Loop",   type: "input",  nodeId: id, dataType: "string" },
      { id: id * 100 + 2, title: "Prompt",        type: "input",  nodeId: id, dataType: "string" },
      { id: id * 100 + 3, title: "System Prompt", type: "input",  nodeId: id, dataType: "string" },
      { id: id * 100 + 4, title: "Response",      type: "output", nodeId: id, dataType: "string" },
      { id: id * 100 + 5, title: "Tokens",        type: "output", nodeId: id, dataType: "number" },
    ],
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    selected: false,
    processing: false,

    process: async (context: NodeExecutionContext) => {
      const n = context.node as ChatNode;

      // CHANGED: Prompt Loop takes priority over Prompt when connected
      const promptLoopInput = context.inputs[n.id * 100 + 1];
      const promptInput     = context.inputs[n.id * 100 + 2];
      const systemPrompt    = context.inputs[n.id * 100 + 3];

      const isLoopMode =
        promptLoopInput !== undefined &&
        promptLoopInput !== null &&
        promptLoopInput !== "";

      const promptValue = isLoopMode ? promptLoopInput : promptInput;
      const prompt = String(promptValue || "");
      const system = String(systemPrompt || "");

      if (!prompt && !system) {
        return { [n.id * 100 + 4]: "No Prompt provided", [n.id * 100 + 5]: 0 };
      }

      const model =
        n.nodeValue?.toString().trim().toLowerCase().replace(/\s+/g, "-") ||
        "claude-3-haiku-20240307";

      console.log("MODEL:", model);

      let CLAUDE_API_KEY = "";
      if (n.getConfigParameter) {
        CLAUDE_API_KEY =
          (n.getConfigParameter("API Key")?.paramValue as string) || "";
      } else {
        throw new Error("Claude API Key not found");
      }

      if (!CLAUDE_API_KEY) {
        return {
          [n.id * 100 + 4]: "Error: Claude API Key not found",
          [n.id * 100 + 5]: 0,
        };
      }

      try {
        console.log(`Executing Claude Chat node ${n.id} with model: ${model}`);
        console.log(
          `Prompt: "${prompt.substring(0, 50)}..." | System: "${system.substring(0, 50)}..."`
        );

        // CHANGED: use full history in loop mode for multi-turn memory
        let messages: { role: "user" | "assistant"; content: string }[];

        if (isLoopMode) {
          // Add the new user message to history
          n._chatHistory.push({ role: "user", content: prompt });
          messages = n._chatHistory;
        } else {
          // Normal single call — reset history
          n._chatHistory = [];
          messages = [{ role: "user", content: prompt }];
        }

        const body: Record<string, unknown> = {
          model,
          messages,
          max_tokens: 4096,
          temperature: 0.7,
          top_p: 1,
        };

        if (system) {
          body.system = system;
        }

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "x-api-key": CLAUDE_API_KEY,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error(`Claude API returned status ${res.status}`);
        }

        console.log("Response", res);

        const json = await res.json();
        const output =
          (json as { content: Array<{ text: string }> }).content?.[0]?.text ??
          "No response from Claude";

        console.log(
          `Claude node ${n.id} received response: ${output.substring(0, 50)}...`
        );

        // CHANGED: append assistant reply to history in loop mode
        if (isLoopMode) {
          n._chatHistory.push({ role: "assistant", content: output });
        }

        const usage = (
          json as { usage?: { input_tokens: number; output_tokens: number } }
        ).usage;
        const totalTokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);

        return {
          [n.id * 100 + 4]: output,
          [n.id * 100 + 5]: totalTokens,
        };
      } catch (error) {
        console.error("Error in Claude Chat node:", error);
        return {
          [n.id * 100 + 4]: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
          [n.id * 100 + 5]: 0,
        };
      }
    },

    configParameters: metadata.configParameters,

    getConfigParameters: function (): ConfigParameterType[] {
      return this.configParameters || [];
    },
    getConfigParameter(parameterName: string): ConfigParameterType | undefined {
      return (this.configParameters ?? []).find(
        (p) => p.parameterName === parameterName
      );
    },
    setConfigParameter(parameterName, value): void {
      const p = (this.configParameters ?? []).find(
        (p) => p.parameterName === parameterName
      );
      if (p) p.paramValue = value;
    },
  };
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType("ClaudeChat", createNClaudeChatNode, metadata);
}