import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { LLMModel, ProviderModels } from "../Models/LLM";
import { Helper } from "../Utils/Helper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODELS_FILE_PATH = path.join(__dirname, "models.json");

function loadModels(): ProviderModels {
  if (!fs.existsSync(MODELS_FILE_PATH)) {
    return {
      OpenAI: [],
      Anthropic: [],
      Gemini: [],
      Groq: [],
      OpenRouter: [],
      Ollama: []
    };
  }
  try {
    const data = fs.readFileSync(MODELS_FILE_PATH, "utf-8");
    const parsed = Helper.JsonParser.safeParse<ProviderModels>(data, (key, value) => {
      if (value === "Infinity") return Infinity;
      return value;
    });
    if (parsed.success) return parsed.data;
    throw new Error("Failed to parse models.json: " + parsed.error);
  } catch (error) {
    console.error("Failed to load models.json", error);
    return {
      OpenAI: [],
      Anthropic: [],
      Gemini: [],
      Groq: [],
      OpenRouter: [],
      Ollama: []
    };
  }
}

export const AvailableLLMs: ProviderModels = loadModels();

export function fetchPublicModels(): ProviderModels {
  return JSON.parse(JSON.stringify(AvailableLLMs));
}

// Fetch Ollama models from configured URLs and merge into AvailableLLMs
export async function initializeOllamaModels(): Promise<void> {
  const ollamaUrls = process.env.OLLAMA_URL;
  if (!ollamaUrls) {
    console.log("ℹ️  OLLAMA_URL not set, skipping Ollama model discovery");
    return;
  }

  const urls = ollamaUrls.split(",").map(u => u.trim()).filter(Boolean);
  if (urls.length === 0) {
    console.log("ℹ️  OLLAMA_URL is empty, skipping Ollama model discovery");
    return;
  }

  console.log(`🔍 Discovering Ollama models from: ${urls.join(", ")}`);

  for (const baseUrl of urls) {
    try {
      const normalizedUrl = baseUrl.replace(/\/+$/, "");
      const res = await fetch(`${normalizedUrl}/api/tags`);
      if (!res.ok) {
        console.warn(`⚠️  Failed to fetch Ollama models from ${normalizedUrl}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const models: LLMModel[] = (data.models || []).map((m: { name: string }) => ({
        name: m.name,
        id: m.name,
        contextWindow: { input: 4096, output: 2048 },
        readonly: false,
      }));

      const existingIds = new Set(AvailableLLMs.Ollama.map(m => m.id));
      const newModels = models.filter(m => !existingIds.has(m.id));
      
      if (newModels.length > 0) {
        AvailableLLMs.Ollama.push(...newModels);
        console.log(`✅ Added ${newModels.length} Ollama models from ${normalizedUrl}`);
      } else {
        console.log(`ℹ️  No new Ollama models from ${normalizedUrl}`);
      }
    } catch (error) {
      console.warn(`⚠️  Error fetching Ollama models from ${baseUrl}:`, error instanceof Error ? error.message : String(error));
    }
  }
}

function saveModels() {
  try {
    const replacer = (key: string, value: unknown) => {
      if (value === Infinity) {
        return "Infinity";
      }
      return value;
    };
    const data = JSON.stringify(AvailableLLMs, replacer, 2);
    fs.writeFileSync(MODELS_FILE_PATH, data);
  } catch (error) {
    console.error("Failed to save models.json", error);
  }
}

export function addModel(provider: keyof ProviderModels, model: LLMModel) {
  if (!AvailableLLMs[provider]) {
    AvailableLLMs[provider] = [];
  }

  const exists = AvailableLLMs[provider].some((m) => m.id === model.id);
  if (exists) {
    throw new Error(`Model with id ${model.id} already exists in ${provider}`);
  }

  if (model.readonly === undefined) {
    model.readonly = false;
  }
  AvailableLLMs[provider].push(model);
  saveModels();
}

export function editModel(
  provider: keyof ProviderModels,
  modelId: string,
  updates: Partial<LLMModel>
) {
  const models = AvailableLLMs[provider];
  if (!models) {
    throw new Error(`Provider ${provider} not found`);
  }
  const index = models.findIndex((m) => m.id === modelId);
  if (index === -1) {
    throw new Error(`Model ${modelId} not found in ${provider}`);
  }

  const model = models[index];

  if (model && model.readonly) {
    throw new Error(`Model ${modelId} is read-only and cannot be modified.`);
  }

  AvailableLLMs[provider][index] = { ...model, ...updates };
  saveModels();
}

export function removeModel(provider: keyof ProviderModels, modelId: string) {
  const models = AvailableLLMs[provider];
  if (!models) {
    throw new Error(`Provider ${provider} not found`);
  }
  const index = models.findIndex((m) => m.id === modelId);
  if (index === -1) {
    throw new Error(`Model ${modelId} not found in ${provider}`);
  }

  const model = models[index];

  if (model && model.readonly) {
    throw new Error(`Model ${modelId} is read-only and cannot be removed.`);
  }

  AvailableLLMs[provider].splice(index, 1);
  saveModels();
}