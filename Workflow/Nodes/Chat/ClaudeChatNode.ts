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
} from "../../types/types";
import { NodeRegistry } from "../../NodeRegistry";
export interface ChatNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}
const metadata: NodeMetadata = {
  category: "Chat",
  title: "Claude Chat",
  nodeType: "ClaudeChat",
  nodeValue: "claude-3-haiku-20240307",
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
      defaultValue: "claude-3-haiku-20240307",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Model name to use for the chat node",
      isNodeBodyContent: true,
      sourceList: [
        {
          key: "claude-3-haiku-20240307",
          label: "Claude 3 Haiku",
        },
        {
          key: "claude-3-sonnet-20240229",
          label: "Claude 3 Sonnet",
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

export function createNClaudeChatNode(id: number): ChatNode {
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

      const model = modelMatch ? modelMatch : "claude-3-haiku-20240307"; // Default fallback

      // Use system prompt from input, but don't use the node.value (which now contains the model)

      try {
        // Get API key from config parameters
        let CLAUDE_API_KEY =
          n.getConfigParameter && n.getConfigParameter("API Key")
            ? (n.getConfigParameter("API Key")?.paramValue as string)
            : "No key";
        // if (n.getConfigParameter) {
        //   CLAUDE_API_KEY =
        //     (n.getConfigParameter("API Key")?.paramValue as string) || "";
        // } else {
        //   throw new Error("API Key not found");
        // }

        console.log("CLAUDE_API_KEY", CLAUDE_API_KEY ? "[set]" : "[missing]");
        console.log(`Using model: ${model}`);
        console.log(
          `Executing Chat node ${n.id} with prompt: "${prompt.substring(
            0,
            50
          )}..."`
        );
        const messages = [{ role: "user", content: prompt }];
        const body: Record<string, unknown> = {
          model,
          messages,
          max_tokens: 4096,
          temperature: 0.7,
          top_p: 1,
          ...(system ? { system } : {}),
        };
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            "x-api-key": `${CLAUDE_API_KEY}`,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error(`Chat API returned status ${res.status}`);
        }

        const json = await res.json();

        // Return an object with both values to support multiple outputs
        return {
          // Socket id 3 is for Response content
          [n.id * 100 + 3]:
            (json as { content: Array<{ text: string }> }).content?.[0]?.text ??
            "No response text available",

          // Socket id 4 is for Token count
          [n.id * 100 + 4]:
            ((
              json as {
                usage?: { input_tokens: number; output_tokens: number };
              }
            ).usage?.input_tokens ?? 0) +
            ((
              json as {
                usage?: { input_tokens: number; output_tokens: number };
              }
            ).usage?.output_tokens ?? 0),
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
  nodeRegistry.registerNodeType("ClaudeChat", createNClaudeChatNode, metadata);
}
