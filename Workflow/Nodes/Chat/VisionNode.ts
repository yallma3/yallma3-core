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
import { Ollama } from "ollama";

export interface VisionNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

interface OpenAIMessage {
  role: string;
  content: string;
}

interface OpenAIChoice {
  message: OpenAIMessage;
  index: number;
  finish_reason: string;
}

interface OpenAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: OpenAIUsage;
}

interface ClaudeContent {
  type: string;
  text: string;
}

interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
}

interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: ClaudeContent[];
  model: string;
  stop_reason: string;
  usage: ClaudeUsage;
}

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  parts: GeminiPart[];
  role: string;
}

interface GeminiCandidate {
  content: GeminiContent;
  finishReason: string;
  index: number;
}

interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokens: number;
}

interface GeminiResponse {
  candidates: GeminiCandidate[];
  usageMetadata: GeminiUsageMetadata;
}

const metadata: NodeMetadata = {
  category: "AI",
  title: "Vision AI (Multi-Provider)",
  nodeType: "VisionAI",
  description: "Multi-provider vision AI node for image analysis. Works with OpenAI, Claude, Gemini, and Ollama vision models.",
  nodeValue: "openai|gpt-4o-mini",
  sockets: [
    { title: "Image (Base64)", type: "input", dataType: "string" },
    { title: "Prompt", type: "input", dataType: "string" },
    { title: "System Prompt", type: "input", dataType: "string" },
    { title: "Response", type: "output", dataType: "string" },
    { title: "Tokens", type: "output", dataType: "number" },
  ],
  width: 400,
  height: 240,
  configParameters: [
    {
      parameterName: "Provider",
      parameterType: "string",
      defaultValue: "openai",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "AI provider to use",
      isNodeBodyContent: true,
      sourceList: [
        { key: "openai", label: "OpenAI" },
        { key: "claude", label: "Anthropic Claude" },
        { key: "gemini", label: "Google Gemini" },
        { key: "ollama", label: "Ollama (Local)" },
      ],
      i18n: {
        en: { "Provider": { Name: "Provider", Description: "AI provider to use" } },
        ar: { "Provider": { Name: "المزود", Description: "مزود الذكاء الاصطناعي" } },
      },
    },
    {
      parameterName: "Model",
      parameterType: "string",
      defaultValue: "gpt-4o-mini",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Vision model to use",
      isNodeBodyContent: true,
      sourceList: [
        // OpenAI Models
        { key: "gpt-5", label: "GPT-5 (Best)", provider: "openai" },
        { key: "o3-pro", label: "o3 Pro (Reasoning)", provider: "openai" },
        { key: "gpt-4o", label: "GPT-4o", provider: "openai" },
        { key: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
        
        // Claude Models
        { key: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "claude" },
        { key: "claude-opus-4-5", label: "Claude Opus 4.5", provider: "claude" },
        { key: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "claude" },
        { key: "claude-opus-4-20250514", label: "Claude Opus 4", provider: "claude" },
        { key: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet", provider: "claude" },
        { key: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", provider: "claude" },
        { key: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", provider: "claude" },
                
        // Gemini Models
        { key: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
        { key: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "gemini" },
        { key: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "gemini" },
        { key: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", provider: "gemini" },
        { key: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", provider: "gemini" },
        { key: "gemini-3-pro-preview", label: "Gemini 3 Pro (Preview)", provider: "gemini" },
        
        // Ollama Models 
        { key: "qwen3-vl:8b", label: "Qwen 3 VL 8B (Best Overall)", provider: "ollama" },
        { key: "qwen3-vl:4b", label: "Qwen 3 VL 4B (Balanced)", provider: "ollama" },
        { key: "qwen3-vl:2b", label: "Qwen 3 VL 2B (Fastest)", provider: "ollama" },
        { key: "deepseek-ocr:3b", label: "DeepSeek OCR 3B (Best OCR)", provider: "ollama" },
        { key: "llama3.2-vision:11b", label: "Llama 3.2 Vision 11B", provider: "ollama" },
        { key: "llama3.2-vision:90b", label: "Llama 3.2 Vision 90B", provider: "ollama" },
        { key: "minicpm-v:8b", label: "MiniCPM-V 8B (Top Choice)", provider: "ollama" },
        { key: "llava:13b", label: "LLaVA 13B (Detailed)", provider: "ollama" },
        { key: "llava:7b", label: "LLaVA 7B", provider: "ollama" },
        { key: "moondream:1.8b", label: "Moondream 1.8B (Edge)", provider: "ollama" },
        { key: "granite3.2-vision:2b", label: "Granite Vision 2B", provider: "ollama" },
      ],
      i18n: {
        en: { "Model": { Name: "Model", Description: "Vision model to use" } },
        ar: { "Model": { Name: "النموذج", Description: "نموذج الرؤية المستخدم" } },
      },
    },
    {
      parameterName: "API Key",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "API Key (not needed for Ollama)",
      isNodeBodyContent: false,
      i18n: {
        en: { "API Key": { Name: "API Key", Description: "API Key for the service" } },
        ar: { "API Key": { Name: "مفتاح API", Description: "مفتاح API للخدمة" } },
      },
    },
    {
      parameterName: "Detail Level",
      parameterType: "string",
      defaultValue: "auto",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Image detail level (OpenAI only)",
      isNodeBodyContent: false,
      sourceList: [
        { key: "auto", label: "Auto" },
        { key: "low", label: "Low" },
        { key: "high", label: "High" },
      ],
      i18n: {
        en: { "Detail Level": { Name: "Detail Level", Description: "Image detail level" } },
        ar: { "Detail Level": { Name: "مستوى التفاصيل", Description: "مستوى تفاصيل الصورة" } },
      },
    },
    {
      parameterName: "Ollama Base URL",
      parameterType: "string",
      defaultValue: "http://localhost:11434",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Ollama server URL (for local models)",
      isNodeBodyContent: false,
      i18n: {
        en: { "Ollama Base URL": { Name: "Ollama Base URL", Description: "Ollama server URL" } },
        ar: { "Ollama Base URL": { Name: "رابط Ollama", Description: "رابط خادم Ollama" } },
      },
    },
  ],
  i18n: {
    en: {
      category: "AI",
      title: "Vision AI (Multi-Provider)",
      nodeType: "Vision AI",
      description: "Multi-provider vision AI for image analysis across OpenAI, Claude, Gemini, and Ollama.",
    },
    ar: {
      category: "ذكاء اصطناعي",
      title: "الذكاء البصري (متعدد المزودين)",
      nodeType: "الذكاء البصري",
      description: "ذكاء بصري متعدد المزودين لتحليل الصور عبر OpenAI و Claude و Gemini و Ollama.",
    },
  },
};

export function createVisionAINode(id: number, position: Position): VisionNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: [
      { id: id * 100 + 1, title: "Image (Base64)", type: "input", nodeId: id, dataType: "string" },
      { id: id * 100 + 2, title: "Prompt", type: "input", nodeId: id, dataType: "string" },
      { id: id * 100 + 3, title: "System Prompt", type: "input", nodeId: id, dataType: "string" },
      { id: id * 100 + 4, title: "Response", type: "output", nodeId: id, dataType: "string" },
      { id: id * 100 + 5, title: "Tokens", type: "output", nodeId: id, dataType: "number" },
    ],
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    selected: false,
    processing: false,
    process: async (context: NodeExecutionContext) => {
      const n = context.node as VisionNode;

      // Get inputs
      const imageInput = await context.inputs[n.id * 100 + 1];
      const promptValue = await context.inputs[n.id * 100 + 2];
      const systemPrompt = await context.inputs[n.id * 100 + 3];

      // Get configuration
      const getConfigParam = n.getConfigParameter?.bind(n);
      if (!getConfigParam) {
        return {
          [n.id * 100 + 4]: "Error: Configuration parameters not available",
          [n.id * 100 + 5]: 0,
        };
      }

      const provider = (getConfigParam("Provider")?.paramValue as string) || "openai";
      const model = (getConfigParam("Model")?.paramValue as string) || "gpt-4o-mini";
      const apiKey = (getConfigParam("API Key")?.paramValue as string) || "";
      const detailLevel = (getConfigParam("Detail Level")?.paramValue as string) || "auto";
      const ollamaBaseUrl = (getConfigParam("Ollama Base URL")?.paramValue as string) || "http://localhost:11434";

      const userPrompt = String(promptValue || "Analyze this image.");
      const systemMsg = String(systemPrompt || "");

      // Process image input
      let imageBase64 = "";
      let mimeType = "image/jpeg";
      if (typeof imageInput === "string") {
        const mimeMatch = imageInput.match(/^data:(image\/[a-z+]+);base64,/i);
        if (mimeMatch?.[1]) {
          mimeType = mimeMatch[1];
        }
        imageBase64 = imageInput.replace(/^data:image\/[a-z]+;base64,/i, "").trim();
      }

      if (!imageBase64) {
        return {
          [n.id * 100 + 4]: "Error: No image provided",
          [n.id * 100 + 5]: 0,
        };
      }

      try {
        console.log(`🔍 Vision AI Node ${n.id}: Provider=${provider}, Model=${model}`);

        let response = "";
        let tokens = 0;

        // Route to appropriate provider
        switch (provider.toLowerCase()) {
          case "openai": {
            ({ response, tokens } = await processOpenAI(model, userPrompt, systemMsg, imageBase64, mimeType, apiKey, detailLevel));
            break;
          }

          case "claude": {
            ({ response, tokens } = await processClaude(model, userPrompt, systemMsg, imageBase64, mimeType, apiKey));
            break;
          }

          case "gemini": {
            ({ response, tokens } = await processGemini(model, userPrompt, systemMsg, imageBase64, mimeType, apiKey));
            break;
          }

          case "ollama": {
            ({ response, tokens } = await processOllama(model, userPrompt, systemMsg, imageBase64, mimeType, ollamaBaseUrl));
            break;
          }

          default: {
            throw new Error(`Unsupported provider: ${provider}`);
          }
        }

        return {
          [n.id * 100 + 4]: response,
          [n.id * 100 + 5]: tokens,
        };

      } catch (error) {
        console.error(`❌ Error in Vision AI node ${n.id}:`, error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          [n.id * 100 + 4]: `Error: ${errorMsg}`,
          [n.id * 100 + 5]: 0,
        };
      }
    },
    configParameters: metadata.configParameters,
    getConfigParameters: function (): ConfigParameterType[] {
      return this.configParameters || [];
    },
    getConfigParameter(parameterName: string): ConfigParameterType | undefined {
      return (this.configParameters ?? []).find((p) => p.parameterName === parameterName);
    },
    setConfigParameter(parameterName: string, value: string | number | boolean): void {
      const param = (this.configParameters ?? []).find((p) => p.parameterName === parameterName);
      if (param) {
        param.paramValue = value;
      }
    },
  };
}

// Provider-specific processing functions
async function processOpenAI(
  model: string,
  prompt: string,
  system: string,
  imageBase64: string,
  mimeType: string,
  apiKey: string,
  detail: string
): Promise<{ response: string; tokens: number }> {
  const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> }> = [];

  if (system) {
    messages.push({ role: "system", content: system });
  }

  messages.push({
    role: "user",
    content: [
      { type: "text", text: prompt },
      {
        type: "image_url",
        image_url: {
          url: `data:${mimeType};base64,${imageBase64}`,
          detail: detail,
        },
      },
    ],
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 4096,
    }),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  
  const json = await res.json() as OpenAIResponse;
  
  return {
    response: json.choices?.[0]?.message?.content || "",
    tokens: json.usage?.total_tokens || 0,
  };
}

async function processClaude(
  model: string,
  prompt: string,
  system: string,
  imageBase64: string,
  mimeType: string,
  apiKey: string
): Promise<{ response: string; tokens: number }> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType,
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
  };

  if (system) {
    body.system = system;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  
  const json = await res.json() as ClaudeResponse;
  
  return {
    response: json.content?.[0]?.text || "",
    tokens: (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || 0),
  };
}

async function processGemini(
  model: string,
  prompt: string,
  system: string,
  imageBase64: string,
  mimeType: string,
  apiKey: string
): Promise<{ response: string; tokens: number }> {
  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64,
            },
          },
          { text: prompt },
        ],
      },
    ],
  };

  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }
  );

  clearTimeout(timeoutId);

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  
  const json = await res.json() as GeminiResponse;
  
  return {
    response: json.candidates?.[0]?.content?.parts?.[0]?.text || "",
    tokens: json.usageMetadata?.totalTokens || 0,
  };
}

async function processOllama(
  model: string,
  prompt: string,
  system: string,
  imageBase64: string,
  mimeType: string,
  baseUrl: string
): Promise<{ response: string; tokens: number }> {
  const ollama = new Ollama({ host: baseUrl });

  const messages: Array<{
    role: string;
    content: string;
    images?: string[];
  }> = [];

  if (system) {
    messages.push({ role: "system", content: system });
  }

  messages.push({
    role: "user",
    content: prompt,
    images: [imageBase64],
  });

  const response = await ollama.chat({
    model,
    messages,
  });

  return {
    response: response.message?.content || "",
    tokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
  };
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType("VisionAI", createVisionAINode, metadata);
}