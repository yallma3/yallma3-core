import type { LLMMessage, LLMOption, LLMProvider, LLMResponse } from "../Models/LLM";
import type { ExecutionTracer, LLMCallerContext } from "../Execution/ExecutionTracer";
import {
  ClaudeProvider,
  GeminiProvider,
  GroqProvider,
  OpenAIProvider,
  OpenRouterProvider,
  OllamaProvider,
  DeepSeekProvider
} from "./LLMProvider";

const PROVIDER_ENDPOINTS = {
  OpenAI: "https://api.openai.com/v1/chat/completions",
  Groq: "https://api.groq.com/openai/v1/chat/completions",
  OpenRouter: "https://openrouter.ai/api/v1/chat/completions",
  Anthropic: "https://api.anthropic.com/v1/messages",
  DeepSeek: "https://api.deepseek.com/v1/chat/completions",
} as const;

export function runLLM(provider: LLMProvider, prompt: string) {
  return provider.generateText(prompt);
}

export function getLLMProvider(llmOption: LLMOption, apiKey: string) {
  const baseUrl = llmOption.options?.baseUrl
  switch (llmOption.provider) {
    case "Groq":
      return new GroqProvider(llmOption.model.id, apiKey);
    case "OpenRouter":
      return new OpenRouterProvider(llmOption.model.id, apiKey);
    case "OpenAI":
      return new OpenAIProvider(llmOption.model.id, apiKey);
    case "Gemini":
      return new GeminiProvider(llmOption.model.id, apiKey);
    case "Anthropic":
      return new ClaudeProvider(llmOption.model.id, apiKey);
    case "Ollama":
      return new OllamaProvider(llmOption.model.id, "", baseUrl || "http://localhost:11434");
    case "DeepSeek":
      return new DeepSeekProvider(llmOption.model.id, apiKey);
    default:
      return new GroqProvider(llmOption.model.id, apiKey);
  }
}

/**
 * Provider-aware, cost-free health probe for the Main LLM.
 *
 * - Ollama: `GET /api/tags` (no auth, no cost)
 * - OpenAI / Groq / OpenRouter: 1-token chat completion (`max_tokens: 1`)
 * - Anthropic: Messages API with `max_tokens: 1`
 * - Gemini: `generateContent` with `maxOutputTokens: 1`
 *
 * Returns `{ ok: true }` when reachable; `{ ok: false, error }` on any
 * non-2xx response, timeout, or network failure.
 *
 * @param timeoutMs Abort timeout in ms. Defaults to 8000; overridable for tests.
 */
export async function testLLMHealth(
  llmOption: LLMOption,
  apiKey: string,
  timeoutMs: number = 8000
): Promise<{ ok: boolean; error?: string }> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    if (llmOption.provider === "Ollama") {
      const baseUrl = llmOption.options?.baseUrl || "http://localhost:11434";
      const res = await fetch(`${baseUrl}/api/tags`, { signal });
      if (!res.ok) return { ok: false, error: `Ollama /api/tags returned ${res.status}` };
      return { ok: true };
    }

    if (llmOption.provider === "Anthropic") {
      const res = await fetch(PROVIDER_ENDPOINTS.Anthropic, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: llmOption.model.id,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
        }),
        signal,
      });
      if (!res.ok) return { ok: false, error: `Anthropic probe returned ${res.status}` };
      return { ok: true };
    }

    if (llmOption.provider === "Gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${llmOption.model.id}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "hi" }] }],
            generationConfig: { maxOutputTokens: 1 },
          }),
          signal,
        }
      );
      if (!res.ok) return { ok: false, error: `Gemini probe returned ${res.status}` };
      return { ok: true };
    }

    // OpenAI / Groq / OpenRouter — OpenAI-compatible chat completions
    const res = await fetch(PROVIDER_ENDPOINTS[llmOption.provider], {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llmOption.model.id,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
      signal,
    });
    if (!res.ok) return { ok: false, error: `${llmOption.provider} probe returned ${res.status}` };
    return { ok: true };
  } catch (err) {
    if (signal.aborted) return { ok: false, error: `timeout after ${timeoutMs}ms` };
    return { ok: false, error: `network error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Fatal failure of the Main LLM during workflow execution. Thrown when the
 * Main LLM fallback itself fails, which must halt the workflow graph and the
 * task graph rather than being swallowed as a per-node error.
 */
export class FatalMainLLMError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "FatalMainLLMError";
  }
}

async function callLLMWithOption(
  option: LLMOption,
  apiKey: string,
  messages: LLMMessage[],
  tracer?: ExecutionTracer,
  caller?: LLMCallerContext
): Promise<LLMResponse> {
  let provider = getLLMProvider(option, apiKey);
  if (tracer) {
    provider = tracer.wrapLLM(
      provider,
      caller ?? { source: "workflow_node", action: "execute_with_fallback" },
      { providerName: option.provider, modelName: option.model.name }
    );
  }
  if (!provider.callLLM) throw new Error(`Provider ${option.provider} does not support callLLM`);
  return provider.callLLM(messages);
}

/**
 * Centralized LLM invocation with graceful fallback to the Main LLM.
 *
 * - If a node-level LLM is configured, try it first; on failure, warn and fall back.
 * - If the Main LLM also fails, throw {@link FatalMainLLMError}.
 */
export async function executeWithFallback({
  nodeLLM,
  mainLLM,
  messages,
  workflowId,
  tracer,
  caller,
}: {
  nodeLLM?: { option: LLMOption; apiKey: string };
  mainLLM: { option: LLMOption; apiKey: string };
  messages: LLMMessage[];
  workflowId?: string;
  tracer?: ExecutionTracer;
  caller?: LLMCallerContext;
}): Promise<LLMResponse> {
  if (nodeLLM) {
    try {
      return await callLLMWithOption(
        nodeLLM.option,
        nodeLLM.apiKey,
        messages,
        tracer,
        caller ?? { source: "workflow_node", workflowId, action: "node_llm" }
      );
    } catch (err) {
      console.warn(
        `[executeWithFallback] Node LLM failed (workflow ${workflowId}), falling back to Main LLM:`,
        err
      );
    }
  }
  try {
    return await callLLMWithOption(
      mainLLM.option,
      mainLLM.apiKey,
      messages,
      tracer,
      caller ?? { source: "workflow_node", workflowId, action: "main_llm_fallback" }
    );
  } catch (err) {
    throw new FatalMainLLMError(
      `Main LLM failed during execution (workflow ${workflowId}): ${(err as Error).message}`
    );
  }
}