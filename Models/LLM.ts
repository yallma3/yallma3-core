export interface LLMOption {
  provider: "groq" | "openrouter" | "openai" | "gemini" | "claude";
  model: string;
}
