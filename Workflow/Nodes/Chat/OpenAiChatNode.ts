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
  title: "OpenAI Chat",
  nodeType: "OpenAIChat",
  nodeValue: "gpt-4o-mini",
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
      defaultValue: "gpt-4o-mini",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Model name to use for the chat node",
      isNodeBodyContent: true,
      sourceList: [
        {
          key: "gpt-4o-mini",
          label: "OpenAI GPT-4o Mini",
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
    },
    {
      parameterName: "API Key",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "API Key for the OpenAI service",
      isNodeBodyContent: false,
    },
  ],
};

/**
 * Create a configured OpenAI Chat node instance at the given position.
 *
 * @param id - Unique numeric identifier for the node
 * @param position - Position object with `x` and `y` coordinates for node placement
 * @returns The constructed `ChatNode` with sockets, execution `process` handler, and config-parameter helpers
 */
export function creatOpenAIChatNode(id: number, position: Position): ChatNode {
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

      // Sanitize the model value
      const rawModel = n.nodeValue?.toString() || "";
      const modelMatch = rawModel.trim().toLowerCase().replace(/\s+/g, "-");
      const model = modelMatch ? modelMatch : "gpt-4o-mini"; // Fallback to default

      try {
        let OPENAI_API_KEY = "";
        if (n.getConfigParameter) {
          OPENAI_API_KEY =
            (n.getConfigParameter("API Key")?.paramValue as string) || "";
        } else {
          throw new Error("API Key not found");
        }

        console.log("OPENAI_API_KEY", OPENAI_API_KEY ? "[set]" : "[missing]");
        console.log(`Using model: ${model}`);
        console.log(
          `Executing OpenAI Chat node ${n.id} with prompt: "${prompt.substring(
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

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: 1000,
            temperature: 0.7,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
          }),
        });

        if (!res.ok) {
          throw new Error(`OpenAI API returned status ${res.status}`);
        }

        const json = await res.json();
        console.log(
          `Chat node ${n.id} received response:`,
          (json as any).choices[0].message.content.substring(0, 50) + "..."
        );

        return {
          [n.id * 100 + 3]: (json as any).choices[0].message.content,
          [n.id * 100 + 4]: (json as any).usage?.total_tokens || 0,
        };
      } catch (error) {
        console.error("Error in OpenAI Chat node:", error);
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

/**
 * Registers the OpenAI Chat node type with the provided node registry.
 *
 * @param nodeRegistry - The registry where the "OpenAIChat" node type will be registered.
 */
export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType("OpenAIChat", creatOpenAIChatNode, metadata);
}