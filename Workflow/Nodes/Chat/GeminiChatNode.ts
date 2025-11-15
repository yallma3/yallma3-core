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
}
const metadata: NodeMetadata = {
  category: "Chat",
  title: "Gemini Chat",
  nodeType: "GeminiChat",
  nodeValue: "gemini-2.5-flash",
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
      defaultValue: "gemini-2.5-flash",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Model name to use for the chat node",
      isNodeBodyContent: true,
      sourceList: [
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
    },
    {
      parameterName: "API Key",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "API Key for the Claude service",
      isNodeBodyContent: false,
    },
  ],
};

export function createNGeminiChatNode(
  id: number,
  position: Position
): ChatNode {
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
    width: metadata.width,
    height: metadata.height,
    selected: false,
    processing: false,

    process: async (context: NodeExecutionContext) => {
      const n = context.node as ChatNode;

      const promptValue = await context.inputs[n.id * 100 + 1];
      const systemPrompt = await context.inputs[n.id * 100 + 2];

      const prompt = String(promptValue || "");
      const system = String(systemPrompt || "");

      if (!prompt && !system) {
        return "No Prompt Nor System prompt provided";
      }

      // Normalize model string from node value
      const model =
        n.nodeValue?.toString().trim().toLowerCase().replace(/\s+/g, "-") ||
        "gemini-2.5-pro";

      console.log("MODEL:", model);

      let GEMINI_API_KEY = "";
      if (n.getConfigParameter) {
        GEMINI_API_KEY =
          (n.getConfigParameter("API Key")?.paramValue as string) || "";
      } else {
        throw new Error("Gemini API Key not found");
      }

      if (!GEMINI_API_KEY) {
        return {
          [n.id * 100 + 3]: "Error: Gemini API Key not found",
          [n.id * 100 + 4]: 0,
        };
      }

      try {
        console.log(`Executing Gemini Chat node ${n.id} with model: ${model}`);
        console.log(
          `Prompt: "${prompt.substring(
            0,
            50
          )}..." | System: "${system.substring(0, 50)}..."`
        );

        const body: Record<string, unknown> = {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            topP: 1,
          },
        };

        if (system) {
          body.systemInstruction = { parts: [{ text: system }] };
        }

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": GEMINI_API_KEY,
            },
            body: JSON.stringify(body),
          }
        );

        if (!res.ok) {
          throw new Error(`Gemini API returned status ${res.status}`);
        }
        console.log("Response", res);

        const json = await res.json();
        const output =
          (json as { candidates?: { content: { parts: { text: string }[] } }[] }).candidates?.[0]?.content?.parts?.[0]?.text ||
          "No response from Gemini";

        console.log(
          `Gemini node ${n.id} received response: ${output.substring(0, 50)}...`
        );

        return {
          [n.id * 100 + 3]: output,
          [n.id * 100 + 4]: (json as { usageMetadata?: { totalTokens: number } }).usageMetadata?.totalTokens || 0,
        };
      } catch (error) {
        console.error("Error in Gemini Chat node:", error);
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
      return (this.configParameters ?? []).find(
        (param) => param.parameterName === parameterName
      );
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
  nodeRegistry.registerNodeType("GeminiChat", createNGeminiChatNode, metadata);
}
