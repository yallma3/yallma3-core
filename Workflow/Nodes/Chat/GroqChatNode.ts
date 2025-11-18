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
}

const metadata: NodeMetadata = {
  category: "AI",
  title: "Groq Chat",
  nodeType: "GroqChat",
  description: "Integrates with the Groq API for high-speed chat completions. It sends a user prompt and an optional system prompt to a selected model, returning the generated response and token usage.",
  nodeValue: "llama-3.1-8b-instant",
  sockets: [
    { title: "Prompt", type: "input", dataType: "string" },
    { title: "System Prompt", type: "input", dataType: "string" },
    { title: "Response", type: "output", dataType: "string" },
    { title: "Tokens", type: "output", dataType: "string" },
  ],
  width: 380,
  height: 220,
  configParameters: [
    {
      parameterName: "Model",
      parameterType: "string",
      defaultValue: "llama-3.1-8b-instant",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Model name to use for the chat node",
      isNodeBodyContent: true,
      sourceList: [
        {
          key: "llama-3.1-8b-instant",
          label: "Llama 3.1 8b Instant",
        },
        {
          key: "gemini-2.5-flash",
          label: "Gemini 2.5 Flash",
        },
        {
          key: "gemini-2.5-pro",
          label: "Gemini 2.5 Pro",
        },
        {
          key: "claude-3-opus-20240229",
          label: "Claude 3 Opus",
        },
        {
          key: "claude-3-5-sonnet-20240620",
          label: "Claude 3.5 Sonnet",
        },
      ],
      i18n: {
        en: {
          "Model": {
            Name: "Model",
            Description: "Model name to use for the chat node",
          },
        },
        ar: {
          "Model": {
            Name: "النموذج",
            Description: "اسم النموذج المراد استخدامه لعقدة المحادثة",
          },
        },
      },
    },
    {
      parameterName: "API Key",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "API Key for the Groq service",
      isNodeBodyContent: false,
      i18n: {
        en: {
          "API Key": {
            Name: "API Key",
            Description: "API Key for the Groq service",
          },
        },
        ar: {
          "API Key": {
            Name: "مفتاح API",
            Description: "مفتاح API لخدمة Groq",
          },
        },
      },
    },
  ],
  i18n: {
    en: {
      category: "AI",
      title: "Groq Chat",
      nodeType: "Groq Chat",
      description: "Integrates with the Groq API for high-speed chat completions. It sends a user prompt and an optional system prompt to a selected model, returning the generated response and token usage.",
    },
    ar: {
      category: "ذكاء اصطناعي",
      title: "محادثة Groq",
      nodeType: "محادثة Groq",
      description: "يتكامل مع Groq API لإتمام المحادثات عالية السرعة. يرسل طلب المستخدم وطلب نظام اختياري إلى نموذج محدد، مُعيداً الاستجابة المُولدة واستخدام الرموز.",
    },
  },
};

export function createNGroqChatNode(id: number, position: Position): ChatNode {
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
        title: "System Prompt",
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
      {
        id: id * 100 + 4,
        title: "Tokens",
        type: "output",
        nodeId: id,
        dataType: "number",
      },
    ],
    x: position.x,
    y: position.y,
    width: metadata.width, // Wider to accommodate multiple inputs
    height: metadata.height, // Taller to fit multi-line text
    selected: false,
    processing: false,
    process: async (context: NodeExecutionContext) => {
      const n = context.node as ChatNode;
      // If we have a cached result for this node, use it
      const promptValue = await context.inputs[n.id * 100 + 1];
      const systemPrompt = await context.inputs[n.id * 100 + 2];

      const prompt = String(promptValue || "");
      const system = String(systemPrompt || "");

      if (!prompt && !system) {
        return "No Prompt Nor System prompt provided";
      }

      // Extract model name from node value
      const modelMatch =
        n.nodeValue?.toString().trim().toLowerCase().replace(/\s+/g, "-") || "";
      console.log("n.nodeValue", n.nodeValue);
      console.log("modelMatch", modelMatch);
      const model = modelMatch ? modelMatch : "llama-3.1-8b-instant"; // Default fallback

      try {
        let GROQ_API_KEY = "";
        if (n.getConfigParameter) {
          GROQ_API_KEY =
            (n.getConfigParameter("API Key")?.paramValue as string) || "";
        } else {
          throw new Error("API Key not found");
        }

        console.log("GROQ_API_KEY", GROQ_API_KEY ? "[set]" : "[missing]");
        console.log(`Using model: ${model}`);
        console.log(
          `Executing Chat node ${n.id} with prompt: "${prompt.substring(
            0,
            50
          )}..."`
        );
        const messages = system
          ? [
              { role: "system", content: system },
              { role: "user", content: prompt },
            ]
          : [{ role: "user", content: prompt }];
        const res = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model: model,
              messages: messages,
              max_tokens: 1000,
              temperature: 0.7,
              top_p: 1,
              frequency_penalty: 0,
              presence_penalty: 0,
            }),
          }
        );

        if (!res.ok) {
          throw new Error(`Chat API returned status ${res.status}`);
        }

         const json = await res.json() as OpenAIResponse;
        console.log(
          `Chat node ${n.id} received response:`,
          json.choices[0]?.message.content?.substring(0, 50) + "..."
        );

        // Return an object with both values to support multiple outputs
       return {
          // Socket id 3 is for Response content
          [n.id * 100 + 3]: json.choices[0]?.message.content || "",
          // Socket id 4 is for Token count
          [n.id * 100 + 4]: json.usage?.total_tokens || 0,
        };
      } catch (error) {
        console.error("Error in Chat node:", error);
        // Return error in the response output
        return {
          [n.id * 100 + 3]: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
          [n.id * 100 + 4]: 0,
        };
      }
    },
    configParameters: metadata.configParameters,

    getConfigParameters: function (): ConfigParameterType[] {
      return this.configParameters || [];
    },
    getConfigParameter(parameterName: string): ConfigParameterType | undefined {
      const parameter = (this.configParameters ?? []).find(
        (param) => param.parameterName === parameterName
      );
      return parameter;
    },
    setConfigParameter(parameterName, value): void {
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
  nodeRegistry.registerNodeType("GroqChat", createNGroqChatNode, metadata);
}
