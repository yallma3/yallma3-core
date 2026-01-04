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

export interface ChatNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "AI",
  title: "Ollama Chat (Vision)",
  nodeType: "OllamaChat",
  description: "Integrates with local Ollama models. Supports text chat and vision (images) if the model supports it (like qwen3-vl, llama3.2-vision, or llava).",
  nodeValue: "qwen3-vl:4b",
  sockets: [
    { title: "Prompt", type: "input", dataType: "string" },
    { title: "System Prompt", type: "input", dataType: "string" },
    { title: "Images (Base64)", type: "input", dataType: "string" },
    { title: "Response", type: "output", dataType: "string" },
    { title: "Tokens", type: "output", dataType: "number" },
  ],
  width: 380,
  height: 260,
  configParameters: [
    {
      parameterName: "Model",
      parameterType: "string",
      defaultValue: "qwen3-vl:4b",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Model name (use a VL model for images)",
      isNodeBodyContent: true,
      sourceList: [
        { key: "qwen3-vl:4b", label: "Qwen 3 VL 4B (Vision)" },
        { key: "qwen3-vl:2b", label: "Qwen 3 VL 2B (Vision)" },
        { key: "gemma3:270m", label: "Gemma 3 270M (Ultra Fast)" },
        { key: "gemma3:4b", label: "Gemma 3 4B" },
        { key: "deepseek-ocr:3b", label: "Deepseek OCR 3B" },
      ],
      i18n: {
        en: { 
          "Model": { 
            Name: "Model", 
            Description: "Model name (use Vision models for image analysis)" 
          } 
        },
        ar: { 
          "Model": { 
            Name: "النموذج", 
            Description: "اسم النموذج (استخدم نماذج الرؤية لتحليل الصور)" 
          } 
        },
      },
    },
    {
      parameterName: "Base URL",
      parameterType: "string",
      defaultValue: "http://localhost:11434",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Ollama server URL",
      isNodeBodyContent: false,
      i18n: {
        en: { 
          "Base URL": { 
            Name: "Base URL", 
            Description: "Ollama server URL" 
          } 
        },
        ar: { 
          "Base URL": { 
            Name: "رابط الخادم", 
            Description: "رابط خادم Ollama" 
          } 
        },
      },
    },
    {
      parameterName: "Temperature",
      parameterType: "number",
      defaultValue: 0.7,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Controls randomness (0-1). Higher = more creative",
      isNodeBodyContent: false,
      i18n: {
        en: {
          "Temperature": {
            Name: "Temperature",
            Description: "Controls randomness (0-1)",
          },
        },
        ar: {
          "Temperature": {
            Name: "درجة الحرارة",
            Description: "يتحكم في العشوائية (0-1)",
          },
        },
      },
    },
    {
      parameterName: "Timeout (seconds)",
      parameterType: "number",
      defaultValue: 300,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Request timeout in seconds (vision models need more time)",
      isNodeBodyContent: false,
      i18n: {
        en: {
          "Timeout (seconds)": {
            Name: "Timeout (seconds)",
            Description: "Request timeout (vision models need 120-300s)",
          },
        },
        ar: {
          "Timeout (seconds)": {
            Name: "المهلة (ثواني)",
            Description: "مهلة الطلب (نماذج الرؤية تحتاج 120-300 ثانية)",
          },
        },
      },
    },
  ],
  i18n: {
    en: {
      category: "AI",
      title: "Ollama Chat (Vision)",
      nodeType: "Ollama Chat",
      description: "Chat with local AI models. Supports vision for image analysis with compatible models.",
    },
    ar: {
      category: "ذكاء اصطناعي",
      title: "محادثة Ollama (الرؤية)",
      nodeType: "محادثة Ollama",
      description: "محادثة مع نماذج الذكاء الاصطناعي المحلية. تدعم الرؤية لتحليل الصور.",
    },
  },
};

export function createNOllamaChatNode(id: number, position: Position): ChatNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: [
      { id: id * 100 + 1, title: "Prompt", type: "input", nodeId: id, dataType: "string" },
      { id: id * 100 + 2, title: "System Prompt", type: "input", nodeId: id, dataType: "string" },
      { id: id * 100 + 5, title: "Images (Base64)", type: "input", nodeId: id, dataType: "string" },
      { id: id * 100 + 3, title: "Response", type: "output", nodeId: id, dataType: "string" },
      { id: id * 100 + 4, title: "Tokens", type: "output", nodeId: id, dataType: "number" },
    ],
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    selected: false,
    processing: false,
    process: async (context: NodeExecutionContext) => {
      const n = context.node as ChatNode;

      // Get inputs - TRY ALL POSSIBLE INPUT METHODS
      const promptValue = await context.inputs[n.id * 100 + 1];
      const systemPrompt = await context.inputs[n.id * 100 + 2];
      
      let imagesInput = await context.inputs[n.id * 100 + 5]; 
      
      if (!imagesInput) {
        console.log(`⚠️ No image at socket 405, checking fallback sockets...`);
        imagesInput = await context.inputs[n.id * 100 + 3]; 
        if (imagesInput) {
          console.log(`⚠️ Found image at socket 403 (Response output socket - wrong connection!)`);
        }
      }

      const prompt = String(promptValue || "");
      const system = String(systemPrompt || "");

      // DEBUG: Log what we received
      console.log(`\n📥 Raw Inputs:`);
      console.log(`  Prompt (${n.id * 100 + 1}):`, prompt.substring(0, 50));
      console.log(`  System (${n.id * 100 + 2}):`, system.substring(0, 50));
      console.log(`  Images (${n.id * 100 + 5}):`, typeof imagesInput, imagesInput ? String(imagesInput).substring(0, 100) : 'undefined');

      // Handle Image Input: Can be single base64 string, array, object (from node outputs), or comma-separated
      let images: string[] = [];
      
      if (imagesInput) {
        console.log(`\n🖼️ Processing image input...`);
        console.log(`  Type: ${typeof imagesInput}`);
        console.log(`  Is Array: ${Array.isArray(imagesInput)}`);
        
        if (typeof imagesInput === "object" && !Array.isArray(imagesInput) && imagesInput !== null) {
          console.log(`  Processing as object...`);
          
          const values = Object.values(imagesInput);
          console.log(`  Object has ${values.length} values`);
          
          for (const value of values) {
            if (typeof value === "string" && value.trim().length > 0) {
              const imageStr = value.trim();
              
              if (imageStr.startsWith("Error:") || imageStr.startsWith("Uploaded file") || imageStr.startsWith("Loaded from")) {
                console.log(`  Skipping info/error string: ${imageStr.substring(0, 50)}...`);
                continue;
              }
              
              const cleanBase64 = imageStr.replace(/^data:image\/[a-z]+;base64,/i, "");
              
              if (cleanBase64.length > 100 && /^[A-Za-z0-9+/]+=*$/.test(cleanBase64.substring(0, 100))) {
                images.push(cleanBase64);
                console.log(`  ✓ Extracted base64 image (${cleanBase64.length} chars)`);
              }
            }
          }
        }
        else if (Array.isArray(imagesInput)) {
          console.log(`  Processing as array (${imagesInput.length} items)...`);
          images = imagesInput
            .map(img => {
              const str = String(img);
              return str.replace(/^data:image\/[a-z]+;base64,/i, "");
            })
            .filter(img => img.length > 100); 
          console.log(`  ✓ Extracted ${images.length} images from array`);
        }
        else if (typeof imagesInput === "string") {
          const imageStr = imagesInput.trim();
          console.log(`  Processing as string (${imageStr.length} chars)...`);
          
          // Skip error/info messages
          if (imageStr.startsWith("Error:") || imageStr.startsWith("Uploaded file")) {
            console.log(`  Skipping info/error string`);
          }
          // Check if it contains commas (multiple images) but not a data URI
          else if (imageStr.includes(",") && !imageStr.startsWith("data:image")) {
            console.log(`  Parsing comma-separated images...`);
            images = imageStr
              .split(",")
              .map(img => img.trim())
              .filter(img => img.length > 100)
              .map(img => img.replace(/^data:image\/[a-z]+;base64,/i, ""));
            console.log(`  ✓ Extracted ${images.length} images`);
          }
          // Single base64 image
          else {
            const cleanBase64 = imageStr.replace(/^data:image\/[a-z]+;base64,/i, "");
            if (cleanBase64.length > 100) {
              images = [cleanBase64];
              console.log(`  ✓ Single base64 image (${cleanBase64.length} chars)`);
            }
          }
        }
      } else {
        console.log(`\n⚠️ No image input found at any socket!`);
      }

      if (images.length > 0) {
        images.forEach((img, idx) => {
          console.log(`  - Image ${idx + 1}: ${img.length} chars, starts with: ${img.substring(0, 30)}...`);
        });
      }

      if (!prompt && !system && images.length === 0) {
        console.log(`\n❌ ERROR: No inputs provided!`);
        return {
          [n.id * 100 + 3]: "Error: No Prompt, System prompt, or Images provided",
          [n.id * 100 + 4]: 0,
        };
      }

      // Get configuration
      const model = n.nodeValue?.toString().trim() || "qwen3-vl:4b";
      let baseUrl = "http://localhost:11434";
      let temperature = 0.7;
      let timeoutSeconds = 300;

      if (n.getConfigParameter) {
        baseUrl = (n.getConfigParameter("Base URL")?.paramValue as string) || baseUrl;
        const tempParam = n.getConfigParameter("Temperature")?.paramValue;
        temperature = typeof tempParam === "number" ? tempParam : 0.7;
        
        const timeoutParam = n.getConfigParameter("Timeout (seconds)")?.paramValue;
        timeoutSeconds = typeof timeoutParam === "number" ? timeoutParam : 300;
      }

      try {
        const isVisionModel = model.includes("vision") || 
                             model.includes("vl") || 
                             model.includes("llava") || 
                             model.includes("ocr");
        
        if (images.length > 0 && !isVisionModel) {
          console.warn(
            `⚠️ WARNING: Model "${model}" may not support vision. ` +
            `Consider using qwen3-vl:4b, llama3.2-vision, or llava.`
          );
        }

        if (system) {
          console.log(`  System: "${system.substring(0, 50)}${system.length > 50 ? "..." : ""}"`);
        }

        // Create Ollama instance
        const ollama = new Ollama({ 
          host: baseUrl,
        });

        // Build messages array
        const messages: Array<{
          role: string;
          content: string;
          images?: string[];
        }> = [];

        // Add system message if provided
        if (system) {
          messages.push({ role: "system", content: system });
        }

        // Add user message with prompt and images
        const userMessage: {
          role: string;
          content: string;
          images?: string[];
        } = {
          role: "user",
          content: prompt || "Analyze this image.",
        };

        if (images.length > 0) {
          userMessage.images = images;
          console.log(`  ✓ Adding ${images.length} images to user message`);
        }

        messages.push(userMessage);

        console.log(`  Processing... (this may take up to ${timeoutSeconds}s for vision models)`);

        // Create a promise that rejects after timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Request timed out after ${timeoutSeconds} seconds`));
          }, timeoutSeconds * 1000);
        });

        // Race between the API call and the timeout
        const response = await Promise.race([
          ollama.chat({
            model: model,
            messages: messages,
            options: {
              temperature: temperature,
            },
          }),
          timeoutPromise,
        ]);

        const content = response.message?.content || "No response from Ollama";
        const totalTokens = (response.prompt_eval_count || 0) + (response.eval_count || 0);

        return {
          [n.id * 100 + 3]: content,
          [n.id * 100 + 4]: totalTokens,
        };
      } catch (error) {
        console.error(`\n❌ Error in Ollama Chat node ${n.id}:`, error);
        
        let errorMessage = "Unknown error";
        if (error instanceof Error) {
          errorMessage = error.message;
          
          // Provide helpful error messages
          if (errorMessage.includes("connect") || errorMessage.includes("ECONNREFUSED")) {
            errorMessage = "Cannot connect to Ollama. Make sure Ollama is running (ollama serve).";
          } else if (errorMessage.includes("model") && errorMessage.includes("not found")) {
            errorMessage = `Model "${model}" not found. Run: ollama pull ${model}`;
          } else if (errorMessage.includes("timeout") || errorMessage.includes("aborted")) {
            errorMessage = `Request timed out after ${timeoutSeconds}s. Vision models need more time - try increasing the timeout to 300s or more in node settings.`;
          }
        }

        return {
          [n.id * 100 + 3]: `Error: ${errorMessage}`,
          [n.id * 100 + 4]: 0,
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

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType("OllamaChat", createNOllamaChatNode, metadata);
}