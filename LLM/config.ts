import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { LLMModel, ProviderModels } from "../Models/LLM";

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
    };
  }
  try {
    const data = fs.readFileSync(MODELS_FILE_PATH, "utf-8");
    return JSON.parse(data, (key, value) => {
      if (value === "Infinity") return Infinity;
      return value;
    });
  } catch (error) {
    console.error("Failed to load models.json", error);
    return {
      OpenAI: [],
      Anthropic: [],
      Gemini: [],
      Groq: [],
      OpenRouter: [],
    };
  }
}

export const AvailableLLMs: ProviderModels = loadModels();

export function fetchPublicModels(): ProviderModels {
  return JSON.parse(JSON.stringify(AvailableLLMs));
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

  // Check for duplicate model ID
  const exists = AvailableLLMs[provider].some((m) => m.id === model.id);
  if (exists) {
    throw new Error(`Model with id ${model.id} already exists in ${provider}`);
  }

  // Ensure the new model is not readonly by default unless specified
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
