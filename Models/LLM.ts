import type { LLMSpecTool, ToolCall } from "./Tool";

export interface ContextWindow {
  input: number; // Max tokens for the prompt
  output: number; // Max tokens the model can generate
}

export interface PricingTier {
  // The upper limit for this tier (e.g., 200,000).
  // Use Infinity for the final/unlimited tier.
  maxTotalTokens: number;

  // The logic for this specific model relies on TOTAL tokens (Input + Output).
  // Some other models might rely only on Input context length, so we can flag it.
  measure: "total" | "input";

  // Prices per 1 Million tokens
  inputPer1MToken: number;
  outputPer1MToken: number;
}

export interface LLMModel {
  id: string;
  name: string;
  contextWindow: ContextWindow;
  mode?: string;
  pricing?: {
    currency: string;
    tiers: PricingTier[];
  };
  readonly?: boolean;
}

export interface ProviderModels {
  OpenAI: LLMModel[];
  Anthropic: LLMModel[];
  Gemini: LLMModel[];
  Groq: LLMModel[];
  OpenRouter: LLMModel[];
}

export interface LLMOption {
  provider: "Groq" | "OpenAI" | "OpenRouter" | "Gemini" | "Anthropic";
  model: LLMModel;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool" | "function";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[] | null;
}

// API Response Types
export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: OpenAIToolCall[];
}

export interface OpenAIChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: string;
}

export interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ClaudeToolUse {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ClaudeContentItem {
  type: "text" | "tool_use";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: ClaudeContentItem[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
}

export interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

export interface GeminiCandidate {
  content: GeminiContent;
  finishReason: string;
  index: number;
}

export interface GeminiResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface LLMProvider {
  /**
   * Main entry point to generate text or run multi-step tool-augmented reasoning.
   * Automatically:
   *  - Sends the prompt to the LLM
   *  - Detects tool calls (if supported)
   *  - Executes tools via the provided executor
   *  - Feeds tool results back to the model for a final answer
   */
  generateText(prompt: string): Promise<string>;

  /**
   * Optional flag — tells the framework that this provider supports native tool calls.
   */
  supportsTools?: boolean;

  /**
   * Registers the available tools and an executor function that runs them.
   */
  registerTools(tools: LLMSpecTool[]): void;

  /**
   * Low-level internal helper: given a response with tool calls,
   * executes tools and returns the model's final completion.
   * Normally handled *inside* generateText().
   */
  handleToolCalls?(response: LLMResponse, prompt: string): Promise<string>;

  /**
   * Internal helper for making raw LLM requests.
   * Useful if you want to subclass LLMProvider for different APIs (OpenAI, Gemini, Claude, etc.)
   */
  callLLM?(messages: LLMMessage[]): Promise<LLMResponse>;
}
