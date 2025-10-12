import type { LLMOption, LLMProvider } from "../Models/LLM";
import {
  ClaudeProvider,
  GeminiProvider,
  GroqProvider,
  OpenAIProvider,
  OpenRouterProvider,
} from "./LLMProvider";

export function runLLM(provider: LLMProvider, prompt: string) {
  return provider.generateText(prompt);
}

export function getLLMProvider(llmOption: LLMOption, apiKey: string) {
  switch (llmOption.provider) {
    case "groq":
      return new GroqProvider(llmOption.model, apiKey);
    case "openrouter":
      return new OpenRouterProvider(llmOption.model, apiKey);
    case "openai":
      return new OpenAIProvider(llmOption.model, apiKey);
    case "gemini":
      return new GeminiProvider(llmOption.model, apiKey);
    case "claude":
      return new ClaudeProvider(llmOption.model, apiKey);
    default:
      return new GroqProvider(llmOption.model, apiKey);
  }
}
