export interface LLMModel {
  name: string;
  id: string;
}

const GroqModels: LLMModel[] = [
  { name: "Llama 3.1 8B", id: "llama-3.1-8b-instant" },
  { name: "Llama 3.3 70B", id: "llama-3.3-70b-versatile" },
  { name: "Llama Guard 4 12B", id: "meta-llama/llama-guard-4-12b" },
  { name: "GPT OSS 20B", id: "openai/gpt-oss-20b" },
  { name: "GPT OSS 120B", id: "openai/gpt-oss-120b" },
];

const OpenAIModels: LLMModel[] = [
  { name: "GPT 5", id: "gpt-5" },
  { name: "GPT 5 nano", id: "gpt-5-nano" },
  { name: "GPT 5 mini", id: "gpt-5-mini" },
  { name: "GPT 4.1", id: "gpt-4.1" },
  { name: "GPT 4.1 nano", id: "gpt-4.1-nano" },
  { name: "GPT 4.1 mini", id: "gpt-4.1-mini" },
  { name: "GPT 4o", id: "gpt-40" },
  { name: "GPT 4o mini", id: "gpt-4o-mini" },
];

const OpenRouterModels: LLMModel[] = [
  { name: "Deepseek chat v3.1 free", id: "deepseek/deepseek-chat-v3.1:free" },
  { name: "Grok Code Fast 1", id: "x-ai/grok-code-fast-1" },
  { name: "Grok 4 Fast", id: "x-ai/grok-4-fast" },
  { name: "Grok 3 Mini", id: "x-ai/grok-3-mini" },
  { name: "GPT OSS 20B", id: "openai/gpt-oss-20b" },
  { name: "GPT OSS 120B", id: "openai/gpt-oss-120b" },
  { name: "Mistral Nemo", id: "mistralai/mistral-nemo" },
  {
    name: "Mistral Small 3.2 24B",
    id: "mistralai/mistral-small-3.2-24b-instruct",
  },
  {
    name: "Qwen3 Coder",
    id: "qwen/qwen3-coder",
  },
  {
    name: "Qwen3 Coder 30B A3B Instruct",
    id: "qwen/qwen3-coder-30b-a3b-instruct",
  },
];

const GeminiModels: LLMModel[] = [
  { name: "Gemini 2.5 Pro", id: "models/gemini-2.5-pro" },
  { name: "Gemini 2.5 Flash", id: "models/gemini-2.5-flash" },
  { name: "Gemini 2.5 Flash-Lite", id: "models/gemini-2.5-flash-lite" },
  { name: "Gemini 2.0 Flash", id: "models/gemini-2.0-flash" },
  { name: "Gemini 2.0 Flash-Lite", id: "models/gemini-2.0-flash-lite" },
  { name: "Gemma 3 12B", id: "models/gemma-3-12b-it" },
  { name: "Gemma 3 27B", id: "models/gemma-3-27b-it" },
];

const AnthropicModels: LLMModel[] = [
  { name: "Claude 3.7 Sonnet", id: "claude-3-7-sonnet-latest" },
  {
    name: "Claude 3.7 Sonnet Thinking",
    id: "claude-3-7-sonnet-thinking-latest",
  },
  { name: "Claude 3.5 Sonnet", id: "claude-3-5-sonnet-latest" },
  { name: "Claude 3.5 Haiku", id: "claude-3-5-haiku-latest" },
  { name: "Claude 3 Opus", id: "claude-3-opus-latest" },
  { name: "Claude 3 Sonnet", id: "claude-3-sonnet-latest" },
  { name: "Claude 3 Haiku", id: "claude-3-haiku-latest" },
];

interface PublicModel {
  id: string; // e.g. "gpt-4o"
  name: string; // e.g. "GPT-4o"
  provider: string; // e.g. "openai"
  contextWindow: number;
  mode?: string;
}

export interface ProviderModels {
  openai: PublicModel[];
  anthropic: PublicModel[];
  gemini: PublicModel[];
  groq: PublicModel[];
  openrouter: PublicModel[];
}

interface LiteLLMRegistry {
  [modelId: string]: {
    litellm_provider?: string;
    max_input_tokens?: number;
    max_tokens?: number;
    mode?: string;
  };
}

export async function fetchPublicModels(): Promise<ProviderModels> {
  const LITELLM_URL =
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

  // Regex to detect date stamps like -2024-04-09, -0613, -1106, -0125
  const DATE_SUFFIX_REGEX = /(-\d{4}-\d{2}-\d{2}|-\d{4}|-\d{6})/;
  const SNAPSHOT_REGEX = /-\d{3}$/; // Matches -001, -002

  // Helper: Decide if a model is a "Main" version
  const isMainModel = (id: string, provider: string) => {
    // 1. Remove specific dated snapshots (e.g. gpt-4o-2024-08-06)
    if (DATE_SUFFIX_REGEX.test(id)) return false;

    // 2. Remove "realtime" or "audio" models (unless you specifically want them)
    if (id.includes("realtime") || id.includes("audio")) return false;

    // 3. Remove "container" or "base" weirdness
    if (id.includes("container")) return false;

    // 4. Provider-Specific cleanup
    if (provider === "openai") {
      // Remove old GPT-3.5 (since GPT-4o-mini is the new standard)
      // Remove generic 'gpt-4' legacy (since Turbo/4o are preferred) if you want strict "latest"
      if (id.includes("gpt-3.5")) return false;
      if (id === "gpt-4") return false; // usually implies the old, expensive 8k model
      if (id === "gpt-4-32k") return false;
    }

    // 3. GOOGLE / GEMINI SPECIFIC
    if (provider == "gemini") {
      // Remove specific snapshots (e.g. gemini-1.5-pro-001)
      if (SNAPSHOT_REGEX.test(id)) return false;

      // Remove "latest" aliases if they are redundant
      // (Usually we prefer 'gemini-1.5-pro' over 'gemini-1.5-pro-latest')
      if (id.endsWith("-latest")) return false;

      // Remove legacy 1.0 models (since 1.5 and 2.0+ are superior)
      if (id.includes("gemini-1.0") || id.includes("gemini-pro-vision"))
        return false;
    }

    return true;
  };

  // Initialize buckets
  const result: ProviderModels = {
    openai: [],
    anthropic: [],
    gemini: [],
    groq: [],
    openrouter: [],
  };

  try {
    // 1. Use native fetch
    const response = await fetch(LITELLM_URL);

    // 2. Fetch doesn't throw on 404/500, so we check ok manually
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    // 3. Parse JSON manually (Axios did this automatically)
    const data = (await response.json()) as LiteLLMRegistry;

    Object.keys(data).forEach((modelId) => {
      // Skip samples
      if (modelId.includes("sample")) return;

      const info = data[modelId];
      if (!info) return;

      if (info.mode !== "chat") return;
      if (modelId.startsWith("ft:")) return;
      if (modelId.includes("audio")) return;

      const isPreview =
        modelId.includes("preview") ||
        modelId.includes("beta") ||
        modelId.includes("dev") ||
        modelId.includes("exp");
      if (isPreview) return;

      const provider = info.litellm_provider?.toLowerCase() || "";
      if (!isMainModel(modelId, provider)) return;

      const model: PublicModel = {
        id: modelId,
        name: modelId,
        provider: provider,
        contextWindow: info.max_input_tokens || info.max_tokens || 4096,
      };

      // --- SORTING LOGIC ---
      if (provider === "openai") {
        result.openai.push(model);
      } else if (provider === "anthropic") {
        result.anthropic.push(model);
      } else if (provider === "groq") {
        result.groq.push(model);
      } else if (provider == "gemini") {
        result.gemini.push(model);
      } else if (provider === "openrouter") {
        result.openrouter.push(model);
      }
    });

    return result;
  } catch (error) {
    console.error("Failed to fetch public model list", error);
    return { openai: [], anthropic: [], gemini: [], groq: [], openrouter: [] };
  }
}

export const AvailableLLMs: Record<string, LLMModel[]> = {
  Groq: GroqModels,
  OpenAI: OpenAIModels,
  OpenRouter: OpenRouterModels,
  Gemini: GeminiModels,
  Anthropic: AnthropicModels,
};
