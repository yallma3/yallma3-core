/*
 * yaLLMa3 - Framework for building AI agents that are capable of learning from their environment and interacting with it.
 *
 * Copyright (C) 2025 yaLLMa3
 * Licensed under MPL 2.0
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
  category: "Chat",
  title: "OpenRouter Chat",
  nodeType: "OpenRouterChat",
  nodeValue: "deepseek/deepseek-chat-v3.1:free",
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
      defaultValue: "deepseek/deepseek-chat-v3.1:free",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Model name to use for the chat node",
      isNodeBodyContent: true,
      sourceList: [
        {
          key: "deepseek/deepseek-chat-v3.1:free",
          label: "Deepseek Chat v3.1",
        },
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

export function createNOpenRouterChatNode(
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

      // Extract model name from node value
      const model =
        n.nodeValue?.toString().trim() || "qwen/qwen2-7b-instruct:free";

      let OPENROUTER_API_KEY = "";
      if (n.getConfigParameter) {
        OPENROUTER_API_KEY =
          (n.getConfigParameter("API Key")?.paramValue as string) || "";
      } else {
        throw new Error("API Key not found");
      }

      try {
        const messages = system
          ? [
              { role: "system", content: system },
              { role: "user", content: prompt },
            ]
          : [{ role: "user", content: prompt }];

        const res = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.7,
              top_p: 1,
            }),
          }
        );

        if (!res.ok) {
          throw new Error(`OpenRouter API returned status ${res.status}`);
        }

        const json = await res.json() as OpenAIResponse;
        const content = json.choices?.[0]?.message?.content || "";

        return {
          [n.id * 100 + 3]: content,
          [n.id * 100 + 4]: json.usage?.total_tokens || 0,
        };
      } catch (error) {
        console.error("Error in OpenRouter Chat node:", error);
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
  nodeRegistry.registerNodeType(
    "OpenRouterChat",
    createNOpenRouterChatNode,
    metadata
  );
}
