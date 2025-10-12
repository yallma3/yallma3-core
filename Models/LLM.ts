import type { LLMSpecTool, ToolCall } from "./Tool";

export interface LLMOption {
  provider: "groq" | "openrouter" | "openai" | "gemini" | "claude";
  model: string;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool" | "function";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Record<string, any>;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[] | null;
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
   * executes tools and returns the model’s final completion.
   * Normally handled *inside* generateText().
   */
  handleToolCalls?(response: LLMResponse, prompt: string): Promise<string>;

  /**
   * Internal helper for making raw LLM requests.
   * Useful if you want to subclass LLMProvider for different APIs (OpenAI, Gemini, Claude, etc.)
   */
  callLLM?(messages: LLMMessage[]): Promise<LLMResponse>;
}
