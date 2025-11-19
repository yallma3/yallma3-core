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
import { AvailableLLMs, type LLMModel } from "../../../LLM/config";
import type { LLMMessage, LLMOption } from "../../../Models/LLM";
import { getLLMProvider } from "../../../LLM/LLMRunner";
export interface ChatNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

// Generate model source list from all providers with provider info
const modelSourceList = Object.entries(AvailableLLMs).flatMap(
  ([provider, models]) =>
    (models as LLMModel[]).map((model: LLMModel) => ({
      key: model.id,
      label: `${provider}: ${model.name}`,
    }))
);

// Helper function to find provider by model ID
function findProviderByModelId(modelId: string): string | null {
  for (const [provider, models] of Object.entries(AvailableLLMs)) {
    if ((models as LLMModel[]).some((model) => model.id === modelId)) {
      return provider;
    }
  }
  return null;
}

const metadata: NodeMetadata = {
  category: "AI",
  title: "LLM Chat",
  nodeType: "LLMChat",
  nodeValue: "Groq",
  description: "Interfaces with various Large Language Model providers (Groq, OpenAI, Anthropic, Gemini, OpenRouter) to generate text responses. Accepts user prompts and optional system prompts to guide the model's behavior, and returns the generated response along with token usage information.",
  sockets: [
    { title: "Prompt", type: "input", dataType: "string" },
    { title: "System Prompt", type: "input", dataType: "string" },
    { title: "Response", type: "output", dataType: "string" },
    { title: "Tokens", type: "output", dataType: "number" },
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
      description: "Model to use for the chat node",
      isNodeBodyContent: true,
      sourceList: modelSourceList,
      i18n: {
        en: {
          "Model": {
            Name: "Model",
            Description: "Select the language model to use for generating responses",
          },
        },
        ar: {
          "Model": {
            Name: "النموذج",
            Description: "اختر نموذج اللغة المستخدم لتوليد الاستجابات",
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
      description: "API Key for the selected provider",
      isNodeBodyContent: false,
      i18n: {
        en: {
          "API Key": {
            Name: "API Key",
            Description: "Enter the API key for authenticating with the selected LLM provider",
          },
        },
        ar: {
          "API Key": {
            Name: "مفتاح API",
            Description: "أدخل مفتاح API للمصادقة مع مزود نموذج اللغة المحدد",
          },
        },
      },
    },
  ],
  i18n: {
    en: {
      category: "AI",
      title: "LLM Chat",
      nodeType: "LLM Chat",
      description: "Interfaces with various Large Language Model providers (Groq, OpenAI, Anthropic, Gemini, OpenRouter) to generate text responses. Accepts user prompts and optional system prompts to guide the model's behavior, and returns the generated response along with token usage information.",
    },
    ar: {
      category: "الذكاء الاصطناعي",
      title: "دردشة نموذج اللغة",
      nodeType: "دردشة نموذج اللغة",
      description: "يتواصل مع مزودي نماذج اللغة الكبيرة المختلفة (Groq، OpenAI، Anthropic، Gemini، OpenRouter) لتوليد استجابات نصية. يقبل مطالبات المستخدم ومطالبات النظام الاختيارية لتوجيه سلوك النموذج، ويعيد الاستجابة المُولدة مع معلومات استخدام الرموز.",
    },
  },
};

export function createLLMChatNode(id: number, position: Position): ChatNode {
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

      const promptValue = await context.inputs[n.id * 100 + 1];
      const systemPrompt = await context.inputs[n.id * 100 + 2];

      const prompt = String(promptValue || "");
      const system = String(systemPrompt || "");

      if (!prompt && !system) {
        return {
          [n.id * 100 + 3]: "No Prompt Nor System prompt provided",
          [n.id * 100 + 4]: 0,
        };
      }

      try {
        // Get configuration parameters
        const modelId =
          (n.getConfigParameter?.("Model")?.paramValue as string) ||
          "llama-3.1-8b-instant";

        // Find provider based on model ID
        let provider = findProviderByModelId(modelId) as
          | "Groq"
          | "OpenAI"
          | "OpenRouter"
          | "Gemini"
          | "Anthropic"
          | null;

        if (!provider) {
          // Fallback to Groq if provider not found
          provider = "Groq";
        }

        let model = AvailableLLMs[provider]?.find((m) => m.id === modelId);

        const apiKey =
          (n.getConfigParameter?.("API Key")?.paramValue as string) || "";

        if (!apiKey) {
          throw new Error(`API Key not found for provider: ${provider}`);
        }

        console.log(`Using provider: ${provider}, model: ${model}`);
        console.log(
          `Executing Chat node ${n.id} with prompt: "${prompt.substring(
            0,
            50
          )}..."`
        );

        if (!model) {
          // Fallback model
          provider = "Groq";
          model = { name: "Llama 3.1 8B", id: "llama-3.1-8b-instant" };
        }
        const llmOption: LLMOption = {
          provider: provider,
          model: model,
        };
        const llmProvider = getLLMProvider(llmOption, apiKey);

        // Build messages array
        const messages: LLMMessage[] = system
          ? [
              { role: "system", content: system },
              { role: "user", content: prompt },
            ]
          : [{ role: "user", content: prompt }];

        // Use the provider's callLLM method for direct API call
        if (!llmProvider.callLLM) {
          throw new Error(
            `Provider ${provider} does not support direct LLM calls`
          );
        }
        const response = await llmProvider.callLLM(messages);

        console.log(
          `Chat node ${n.id} received response:`,
          response.content?.substring(0, 50) + "..."
        );

        return {
          [n.id * 100 + 3]: response.content || "",
          [n.id * 100 + 4]: 0, // Token count not available in unified response
        };
      } catch (error) {
        console.error("Error in Chat node:", error);
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
  nodeRegistry.registerNodeType("LLMChat", createLLMChatNode, metadata);
}
