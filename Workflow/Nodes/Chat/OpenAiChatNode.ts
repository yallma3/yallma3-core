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
 * See the Mozilla Public License for the specific language governing rights and limitations under the License.
 */

import type {
  BaseNode,
  Position,
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  NodeMetadata,
} from "../../types/types";
import { NodeRegistry } from "../../NodeRegistry";
import type { OpenAIResponse } from "../../../Models/LLM";

export interface ChatNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
  _chatHistory: { role: "user" | "assistant" | "system"; content: string }[];
}
const metadata: NodeMetadata = {
  category: "AI",
  title: "OpenAI Chat",
  nodeType: "OpenAIChat",
  description:
    "Integrates with the OpenAI API for chat completions. Connect User Input to Prompt Loop for a multi-turn chat loop, or to Prompt for a single call.",
  nodeValue: "gpt-4o-mini",
  sockets: [
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
      defaultValue: "gpt-4o-mini",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Model name to use for the chat node",
      isNodeBodyContent: true,
      sourceList: [
        { key: "gpt-4o-mini",   label: "GPT-4o Mini"   },
        { key: "gpt-4o",        label: "GPT-4o"        },
        { key: "gpt-4-turbo",   label: "GPT-4 Turbo"   },
        { key: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
        { key: "o1-mini",       label: "o1-mini"       },
        { key: "o1",            label: "o1"            },
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
      description: "API Key for the OpenAI service",
      isNodeBodyContent: false,
      i18n: {
        en: { "API Key": { Name: "API Key", Description: "API Key for the OpenAI service" } },
        ar: { "API Key": { Name: "مفتاح API", Description: "مفتاح API لخدمة OpenAI" } },
      },
    },
  ],
  i18n: {
    en: {
      category: "AI",
      title: "OpenAI Chat",
      nodeType: "OpenAI Chat",
      description:
        "Integrates with the OpenAI API for chat completions. Supports single-turn and multi-turn loop mode.",
    },
    ar: {
      category: "ذكاء اصطناعي",
      title: "محادثة OpenAI",
      nodeType: "محادثة OpenAI",
      description:
        "يتكامل مع OpenAI API لإتمام المحادثات. يدعم الوضع الأحادي ووضع الحلقة متعددة الأدوار.",
    },
  },
};

export function creatOpenAIChatNode(id: number, position: Position): ChatNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    _chatHistory: [],
    sockets: [
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

      const rawModel = n.nodeValue?.toString() || "";
      const model = rawModel.trim().toLowerCase().replace(/\s+/g, "-") || "gpt-4o-mini";

      console.log("MODEL:", model);

      let OPENAI_API_KEY = "";
      if (n.getConfigParameter) {
        OPENAI_API_KEY =
          (n.getConfigParameter("API Key")?.paramValue as string) || "";
      } else {
        throw new Error("OpenAI API Key not found");
      }

      if (!OPENAI_API_KEY) {
        return {
          [n.id * 100 + 4]: "Error: OpenAI API Key not found",
          [n.id * 100 + 5]: 0,
        };
      }

      try {
        console.log(`Executing OpenAI Chat node ${n.id} with model: ${model}`);
        console.log(
          `Prompt: "${prompt.substring(0, 50)}..." | System: "${system.substring(0, 50)}..."`
        );
        let messages: { role: "user" | "assistant" | "system"; content: string }[];

        if (isLoopMode) {
          // On first turn, prepend system message if provided
          if (n._chatHistory.length === 0 && system) {
            n._chatHistory.push({ role: "system", content: system });
          }
          n._chatHistory.push({ role: "user", content: prompt });
          messages = n._chatHistory;
        } else {
          // Normal single call — reset history
          n._chatHistory = [];
          messages = system
            ? [
                { role: "system", content: system },
                { role: "user", content: prompt },
              ]
            : [{ role: "user", content: prompt }];
        }

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: 4096,
            temperature: 0.7,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
          }),
        });

        if (!res.ok) {
          throw new Error(`OpenAI API returned status ${res.status}`);
        }

        console.log("Response", res);

        const json = (await res.json()) as OpenAIResponse;
        const output = json.choices?.[0]?.message?.content ?? "No response from OpenAI";

        console.log(
          `OpenAI node ${n.id} received response: ${output.substring(0, 50)}...`
        );
        if (isLoopMode) {
          n._chatHistory.push({ role: "assistant", content: output });
        }

        return {
          [n.id * 100 + 4]: output,
          [n.id * 100 + 5]: json.usage?.total_tokens ?? 0,
        };
      } catch (error) {
        console.error("Error in OpenAI Chat node:", error);
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
  nodeRegistry.registerNodeType("OpenAIChat", creatOpenAIChatNode, metadata);
}