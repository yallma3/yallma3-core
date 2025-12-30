import type { LLMOption, LLMProvider } from "../Models/LLM";
import {
  ClaudeProvider,
  GeminiProvider,
  GroqProvider,
  OpenAIProvider,
  OpenRouterProvider,
  OllamaProvider
} from "./LLMProvider";

export function runLLM(provider: LLMProvider, prompt: string) {
  return provider.generateText(prompt);
}

export function getLLMProvider(llmOption: LLMOption, apiKey: string, baseUrl?: string) {
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
    default:
      return new GroqProvider(llmOption.model.id, apiKey);
  }
}