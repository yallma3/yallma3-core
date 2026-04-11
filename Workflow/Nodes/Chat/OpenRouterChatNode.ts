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
  _chatHistory: { role: "user" | "assistant" | "system"; content: string }[];
}
const metadata: NodeMetadata = {
  category: "AI",
  title: "OpenRouter Chat",
  nodeType: "OpenRouterChat",
  description:
    "Integrates with the OpenRouter API, providing access to a diverse range of models. Connect User Input to Prompt Loop for a multi-turn chat loop, or to Prompt for a single call.",
  nodeValue: "deepseek/deepseek-chat-v3.1:free",
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
      defaultValue: "deepseek/deepseek-chat-v3.1:free",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Model name to use for the chat node",
      isNodeBodyContent: true,
      sourceList: [
        { key: "deepseek/deepseek-chat-v3.1:free", label: "Deepseek Chat v3.1" },
        { key: "gpt-4o-mini",                      label: "OpenAI GPT-4o Mini" },
        { key: "gemini-2.5-flash",                 label: "Gemini 2.5 Flash"   },
        { key: "gemini-2.5-pro",                   label: "Gemini 2.5 Pro"     },
        { key: "claude-3-opus-20240229",            label: "Claude 3 Opus"      },
        { key: "claude-3-5-sonnet-20240620",        label: "Claude 3.5 Sonnet"  },
        { key: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70b (free)" },
        { key: "mistralai/mistral-7b-instruct:free",     label: "Mistral 7b (free)"    },
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
      description: "API Key for the OpenRouter service",
      isNodeBodyContent: false,
      i18n: {
        en: { "API Key": { Name: "API Key", Description: "API Key for the OpenRouter service" } },
        ar: { "API Key": { Name: "مفتاح API", Description: "مفتاح API لخدمة OpenRouter" } },
      },
    },
  ],
  i18n: {
    en: {
      category: "AI",
      title: "OpenRouter Chat",
      nodeType: "OpenRouter Chat",
      description:
        "Integrates with the OpenRouter API. Supports single-turn and multi-turn loop mode.",
    },
    ar: {
      category: "ذكاء اصطناعي",
      title: "محادثة OpenRouter",
      nodeType: "محادثة OpenRouter",
      description:
        "يتكامل مع OpenRouter API. يدعم الوضع الأحادي ووضع الحلقة متعددة الأدوار.",
    },
  },
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

      // OpenRouter model keys can contain slashes — don't lowercase
      const model =
        n.nodeValue?.toString().trim() || "deepseek/deepseek-chat-v3.1:free";

      console.log("MODEL:", model);

      let OPENROUTER_API_KEY = "";
      if (n.getConfigParameter) {
        OPENROUTER_API_KEY =
          (n.getConfigParameter("API Key")?.paramValue as string) || "";
      } else {
        throw new Error("OpenRouter API Key not found");
      }

      if (!OPENROUTER_API_KEY) {
        return {
          [n.id * 100 + 4]: "Error: OpenRouter API Key not found",
          [n.id * 100 + 5]: 0,
        };
      }

      try {
        console.log(`Executing OpenRouter Chat node ${n.id} with model: ${model}`);
        console.log(
          `Prompt: "${prompt.substring(0, 50)}..." | System: "${system.substring(0, 50)}..."`
        );

        let messages: { role: "user" | "assistant" | "system"; content: string }[];

        if (isLoopMode) {
          if (n._chatHistory.length === 0 && system) {
            n._chatHistory.push({ role: "system", content: system });
          }
          n._chatHistory.push({ role: "user", content: prompt });
          messages = n._chatHistory;
        } else {
          n._chatHistory = [];
          messages = system
            ? [
                { role: "system", content: system },
                { role: "user", content: prompt },
              ]
            : [{ role: "user", content: prompt }];
        }

        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
        });

        if (!res.ok) {
          throw new Error(`OpenRouter API returned status ${res.status}`);
        }

        console.log("Response", res);

        const json = (await res.json()) as OpenAIResponse;
        const output =
          json.choices?.[0]?.message?.content || "No response from OpenRouter";

        console.log(
          `OpenRouter node ${n.id} received response: ${output.substring(0, 50)}...`
        );
        if (isLoopMode) {
          n._chatHistory.push({ role: "assistant", content: output });
        }

        return {
          [n.id * 100 + 4]: output,
          [n.id * 100 + 5]: json.usage?.total_tokens || 0,
        };
      } catch (error) {
        console.error("Error in OpenRouter Chat node:", error);
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
  nodeRegistry.registerNodeType(
    "OpenRouterChat",
    createNOpenRouterChatNode,
    metadata
  );
}