import type { LLMSpecTool, ToolCall } from "../Models/Tool";
import type {
  LLMMessage,
  LLMResponse,
  LLMProvider,
  OpenAIMessage,
  OpenAIResponse,
  OpenAIToolCall,
  ClaudeResponse,
  ClaudeContentItem,
  GeminiResponse,
  GeminiPart,
} from "../Models/LLM";
import { Ollama } from "ollama";
import type { Tool } from "ollama";

export class OpenAIProvider implements LLMProvider {
  private model: string;
  private apiKey: string;
  private tools: LLMSpecTool[] = [];

  supportsTools = true;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  /**
   * Register tools and their executor for tool-augmented reasoning
   */
  registerTools(tools: LLMSpecTool[]) {
    this.tools = tools;
  }

  /**
   * Execute tools and return tool messages
   */
  private async executeTools(toolCalls: ToolCall[]): Promise<LLMMessage[]> {
    const toolMessages: LLMMessage[] = [];

    for (const call of toolCalls) {
      const tool = this.tools.find((t) => t.name === call.name);
      if (!tool?.executor) {
        console.warn(`Tool ${call.name} not found or has no executor`);
        toolMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: `Tool ${call.name} not found` }),
        });
        continue;
      }

      try {
        // Add timeout protection
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Tool execution timeout")), 30000)
        );
        const result = await Promise.race([
          tool.executor(call.input),
          timeoutPromise,
        ]);

        toolMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      } catch (error) {
        console.error(`Tool ${call.name} execution failed:`, error);
        toolMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: String(error) }),
        });
      }
    }

    return toolMessages;
  }

  /**
   * Unified entry point for generating text or running tool calls automatically
   */
  async generateText(prompt: string): Promise<string> {
    let messages: LLMMessage[] = [{ role: "user", content: prompt }];
    let maxIterations = 10; // Prevent infinite loops
    let iteration = 0;

    while (iteration < maxIterations) {
      const response = await this.callLLM(messages);

      // If no tool calls, return the content
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return response.content || "";
      }

      // Execute tools and prepare for next iteration
      const toolMessages = await this.executeTools(response.toolCalls);

      // Build conversation history for next call
      messages = [
        ...messages,
        {
          role: "assistant",
          content: null,
          tool_calls: response.toolCalls.map((t) => ({
            id: t.id,
            type: "function",
            function: {
              name: t.name,
              arguments: JSON.stringify(t.input),
            },
          })),
        } as LLMMessage,
        ...toolMessages,
      ];

      iteration++;
    }

    throw new Error(`Maximum tool call iterations (${maxIterations}) exceeded`);
  }

  /**
   * Makes a raw call to the OpenAI API
   */
  async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: 0.7,
      top_p: 1,
    };

    if (this.supportsTools && this.tools.length > 0) {
      body.tools = this.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API returned status ${res.status}`);
    }

    const json = (await res.json()) as OpenAIResponse;
    const message = json.choices?.[0]?.message;

    if (!message) {
      throw new Error("Invalid OpenAI response format");
    }

    const rawContent: string | null = message.content ?? null;
    const toolCalls: ToolCall[] | null =
      message.tool_calls?.map((t: OpenAIToolCall) => ({
        id: t.id,
        name: t.function?.name ?? "",
        input: JSON.parse(t.function?.arguments ?? "{}") as Record<
          string,
          unknown
        >,
      })) || null;

    const content =
      rawContent ||
      (toolCalls?.length && toolCalls[0] ? `Calling tool ${toolCalls[0].name}` : "");

    return { content, toolCalls };
  }
}

export class GroqProvider implements LLMProvider {
  private model: string;
  private apiKey: string;
  private tools: LLMSpecTool[] = [];

  supportsTools = true;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  /**
   * Register tools and their executor for tool-augmented reasoning
   */
  registerTools(tools: LLMSpecTool[]) {
    this.tools = tools;
  }

  /**
   * Execute tools and return tool messages
   */
  private async executeTools(toolCalls: ToolCall[]): Promise<LLMMessage[]> {
    const toolMessages: LLMMessage[] = [];

    for (const call of toolCalls) {
      const tool = this.tools.find((t) => t.name === call.name);
      if (!tool?.executor) continue;
      const result = await tool.executor(call.input);

      toolMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }

    return toolMessages;
  }

  /**
   * Unified entry point for generating text or running tool calls automatically
   */
  async generateText(prompt: string): Promise<string> {
    let messages: LLMMessage[] = [{ role: "user", content: prompt }];
    let maxIterations = 10; // Prevent infinite loops
    let iteration = 0;

    while (iteration < maxIterations) {
      const response = await this.callLLM(messages);

      // If no tool calls, return the content
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return response.content || "";
      }

      // Execute tools and prepare for next iteration
      const toolMessages = await this.executeTools(response.toolCalls);

      // Build conversation history for next call
      messages = [
        ...messages,
        {
          role: "assistant",
          content: null,
          tool_calls: response.toolCalls.map((t) => ({
            id: t.id,
            type: "function",
            function: {
              name: t.name,
              arguments: JSON.stringify(t.input),
            },
          })),
        } as OpenAIMessage,
        ...toolMessages,
      ];

      iteration++;
    }

    throw new Error(`Maximum tool call iterations (${maxIterations}) exceeded`);
  }

  /**
   * Makes a raw call to the Groq API
   */
  async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages,
      temperature: 0.7,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    };

    if (this.supportsTools && this.tools.length > 0) {
      body.tools = this.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text(); // or res.json()
      throw new Error(`Chat API returned status ${res.status}: ${errorBody}`);
    }

    const json = (await res.json()) as OpenAIResponse;

    const message = json.choices[0]?.message;
    if (!message) {
      throw new Error("Invalid Groq response format");
    }

    // Extract both content and tool calls safely
    const rawContent: string | null = message.content ?? null;
    const toolCalls: ToolCall[] | null =
      message.tool_calls?.map((t: OpenAIToolCall) => ({
        id: t.id,
        name: t.function?.name ?? "",
        input: JSON.parse(t.function?.arguments ?? "{}") as Record<
          string,
          unknown
        >,
      })) || null;

    const content =
      rawContent ||
      (toolCalls?.length && toolCalls[0] ? `calling tool ${toolCalls[0].name}` : "");

    return { content, toolCalls };
  }
}

export class OpenRouterProvider implements LLMProvider {
  private model: string;
  private apiKey: string;
  private tools: LLMSpecTool[] = [];

  supportsTools = true;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  /**
   * Register tools and their executor for tool-augmented reasoning
   */
  registerTools(tools: LLMSpecTool[]) {
    this.tools = tools;
  }

  /**
   * Execute tools and return tool messages
   */
  private async executeTools(toolCalls: ToolCall[]): Promise<LLMMessage[]> {
    const toolMessages: LLMMessage[] = [];

    for (const call of toolCalls) {
      const tool = this.tools.find((t) => t.name === call.name);
      if (!tool?.executor) continue;
      const result = await tool.executor(call.input);

      toolMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }

    return toolMessages;
  }

  /**
   * Unified entry point for generating text or running tool calls automatically
   */
  async generateText(prompt: string): Promise<string> {
    let messages: LLMMessage[] = [{ role: "user", content: prompt }];
    let maxIterations = 10; // Prevent infinite loops
    let iteration = 0;

    while (iteration < maxIterations) {
      const response = await this.callLLM(messages);

      // If no tool calls, return the content
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return response.content || "";
      }

      // Execute tools and prepare for next iteration
      const toolMessages = await this.executeTools(response.toolCalls);

      // Build conversation history for next call
      messages = [
        ...messages,
        {
          role: "assistant",
          content: null,
          tool_calls: response.toolCalls.map((t) => ({
            id: t.id,
            type: "function",
            function: {
              name: t.name,
              arguments: JSON.stringify(t.input),
            },
          })),
        } as OpenAIMessage,
        ...toolMessages,
      ];

      iteration++;
    }

    throw new Error(`Maximum tool call iterations (${maxIterations}) exceeded`);
  }

  /**
   * Makes a raw call to the OpenRouter API
   */
  async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: 0.7,
      top_p: 1,
    };

    if (this.supportsTools && this.tools.length > 0) {
      body.tools = this.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter API returned status ${res.status}`);
    }

    const json = await res.json();
    const message = (json as OpenAIResponse).choices?.[0]?.message;
    if (!message) {
      throw new Error("Invalid OpenRouter response format");
    }

    // Extract both content and tool calls safely
    const rawContent: string | null = message.content ?? null;
    const toolCalls =
      message.tool_calls?.map((t: OpenAIToolCall) => ({
        id: t.id,
        name: t.function?.name ?? "",
        input: JSON.parse(t.function?.arguments ?? "{}") as Record<string, unknown>,
      })) || null;

    const content =
      rawContent ||
      (toolCalls?.length && toolCalls[0] ? `calling tool ${toolCalls[0].name}` : "");

    return { content, toolCalls };
  }
}
export class GeminiProvider implements LLMProvider {
  private model: string;
  private apiKey: string;
  private tools: LLMSpecTool[] = [];

  supportsTools = true;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  /**
   * Register tools and their executor for tool-augmented reasoning
   */
  registerTools(tools: LLMSpecTool[]) {
    this.tools = tools;
  }

  /**
   * Execute tools and return tool results for Gemini format
   */
  private async executeTools(
    toolCalls: ToolCall[]
  ): Promise<Record<string, unknown>[]> {
    const toolResults: Record<string, unknown>[] = [];

    for (const call of toolCalls) {
      const tool = this.tools.find((t) => t.name === call.name);
      if (!tool?.executor) continue;
      const result = await tool.executor(call.input);

      toolResults.push({
        functionResponse: {
          name: call.name,
          response: result,
        },
      });
    }

    return toolResults;
  }

  /**
   * Unified entry point for generating text or running tool calls automatically
   */
  async generateText(prompt: string): Promise<string> {
    let messages: LLMMessage[] = [{ role: "user", content: prompt }];
    let maxIterations = 10; // Prevent infinite loops
    let iteration = 0;

    while (iteration < maxIterations) {
      const response = await this.callLLM(messages);

      // If no tool calls, return the content
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return response.content || "";
      }

      // Execute tools and prepare for next iteration
      const toolResults = await this.executeTools(response.toolCalls);

      // Build conversation history for next call (Gemini format)
      messages = [
        ...messages,
        {
          role: "assistant",
          content: response.toolCalls
            .map(
              (call) =>
                `Calling ${call.name} with args: ${JSON.stringify(call.input)}`
            )
            .join(", "),
        },
        {
          role: "user",
          content: `Tool results: ${JSON.stringify(
            toolResults.map((r) => r.functionResponse)
          )}`,
        },
      ];

      iteration++;
    }

    throw new Error(`Maximum tool call iterations (${maxIterations}) exceeded`);
  }

  /**
   * Makes a raw call to the Gemini API
   */
  async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      contents: messages.map((msg) => ({
        role: msg.role === "assistant" ? "model" : msg.role,
        parts: [{ text: msg.content }],
      })),
      generationConfig: {
        temperature: 0.7,
        topP: 1,
      },
    };

    // Attach tools if available
    if (this.supportsTools && this.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: this.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    console.log("GEMINI URL", url);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("Gemini API error body:", error);
      throw new Error(`Gemini API returned status ${res.status}`);
    }

    const json = (await res.json()) as GeminiResponse;

    const candidates = json.candidates ?? [];
    const first = candidates[0];
    const parts = first?.content?.parts ?? [];

    const rawContent = parts.find((p: GeminiPart) => p.text)?.text ?? null;

    const functionCalls =
      parts
        .filter((p: GeminiPart) => p.functionCall)
        .map((p: GeminiPart) => {
          if (!p.functionCall) {
            throw new Error("functionCall is undefined");
          }
          return {
            id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: p.functionCall.name,
            input: p.functionCall.args,
          };
        }) || [];

    const content =
      rawContent ||
      (functionCalls.length && functionCalls[0] ? `calling tool ${functionCalls[0].name}` : "");

    return {
      content,
      toolCalls: functionCalls.length ? functionCalls : null,
    };
  }
}

export class ClaudeProvider implements LLMProvider {
  private model: string;
  private apiKey: string;
  private tools: LLMSpecTool[] = [];

  supportsTools = true;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  /**
   * Register tools and their executor for tool-augmented reasoning
   */
  registerTools(tools: LLMSpecTool[]) {
    this.tools = tools;
  }

  /**
   * Execute tools and return tool messages for Claude format
   */
  private async executeTools(toolCalls: ToolCall[]): Promise<LLMMessage[]> {
    const toolMessages: LLMMessage[] = [];

    for (const call of toolCalls) {
      const tool = this.tools.find((t) => t.name === call.name);
      if (!tool?.executor) continue;
      const result = await tool.executor(call.input);

      toolMessages.push({
        role: "user",
        content: JSON.stringify([
          {
            type: "tool_result",
            tool_use_id: call.id,
            content: JSON.stringify(result),
          },
        ]),
      } as LLMMessage);
    }

    return toolMessages;
  }

  /**
   * Unified entry point for generating text or running tool calls automatically
   */
  async generateText(prompt: string): Promise<string> {
    let messages: LLMMessage[] = [{ role: "user", content: prompt }];
    let maxIterations = 10; // Prevent infinite loops
    let iteration = 0;

    while (iteration < maxIterations) {
      const response = await this.callLLM(messages);

      // If no tool calls, return the content
      if (!response.toolCalls || response.toolCalls.length === 0) {
        return response.content || "";
      }

      // Execute tools and prepare for next iteration
      const toolMessages = await this.executeTools(response.toolCalls);

      // Build conversation history for next call (Claude format)
      messages = [
        ...messages,
        {
          role: "assistant",
          content: JSON.stringify(response.toolCalls.map((call) => ({
            type: "tool_use",
            id: call.id,
            name: call.name,
            input: call.input,
          }))),
        } as LLMMessage,
        ...toolMessages,
      ];

      iteration++;
    }

    throw new Error(`Maximum tool call iterations (${maxIterations}) exceeded`);
  }

  /**
   * Makes a raw call to the Claude API
   */
  async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 4096,
      messages,
      temperature: 0.7,
      top_p: 1,
    };

    if (this.supportsTools && this.tools.length > 0) {
      body.tools = this.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": `${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Claude API returned status ${res.status}`);
    }

    const json = (await res.json()) as ClaudeResponse;
    const content = json.content ?? [];

    const toolUses =
      content
        ?.filter((item: ClaudeContentItem) => item.type === "tool_use")
        ?.map((item: ClaudeContentItem) => ({
          id: item.id ?? "",
          name: item.name ?? "",
          input: item.input ?? {},
        })) || null;

    // 🔍 Detect normal text content
    const textPart = content?.find(
      (item: ClaudeContentItem) => item.type === "text"
    );
    const rawText = textPart?.text ?? null;

    const finalContent =
      rawText || (toolUses?.length && toolUses[0] ? `calling tool ${toolUses[0].name}` : "");

    return {
      content: finalContent,
      toolCalls: toolUses?.length ? toolUses : null,
    };
  }
}

export class OllamaProvider implements LLMProvider {
  private model: string;
  private client: Ollama;
  private tools: LLMSpecTool[] = [];

  supportsTools = true;

  constructor(model: string, _apiKey?: string, baseUrl: string = "http://localhost:11434") {
    this.model = model;
    this.client = new Ollama({ host: baseUrl });
  }

  /**
   * Register tools and their executor for tool-augmented reasoning
   */
  registerTools(tools: LLMSpecTool[]) {
    this.tools = tools;
  }

  /**
   * Execute tools and return tool messages
   */
  private async executeTools(toolCalls: ToolCall[]): Promise<LLMMessage[]> {
    const toolMessages: LLMMessage[] = [];

    for (const call of toolCalls) {
      const tool = this.tools.find((t) => t.name === call.name);
      if (!tool?.executor) {
        console.warn(`Tool ${call.name} not found or has no executor`);
        toolMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: `Tool ${call.name} not found` }),
        });
        continue;
      }

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Tool execution timeout")), 30000)
        );
        const result = await Promise.race([
          tool.executor(call.input),
          timeoutPromise,
        ]);

        toolMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      } catch (error) {
        console.error(`Tool ${call.name} execution failed:`, error);
        toolMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: String(error) }),
        });
      }
    }

    return toolMessages;
  }

  /**
   * Unified entry point for generating text or running tool calls automatically
   */
  async generateText(prompt: string): Promise<string> {
    let messages: LLMMessage[] = [{ role: "user", content: prompt }];
    let maxIterations = 10;
    let iteration = 0;

    while (iteration < maxIterations) {
      const response = await this.callLLM(messages);

      if (!response.toolCalls || response.toolCalls.length === 0) {
        return response.content || "";
      }

      const toolMessages = await this.executeTools(response.toolCalls);

      messages = [
        ...messages,
        {
          role: "assistant",
          content: null,
          tool_calls: response.toolCalls.map((t) => ({
            id: t.id,
            type: "function",
            function: {
              name: t.name,
              arguments: JSON.stringify(t.input),
            },
          })),
        } as LLMMessage,
        ...toolMessages,
      ];

      iteration++;
    }

    throw new Error(`Maximum tool call iterations (${maxIterations}) exceeded`);
  }

  /**
   * Makes a raw call to the Ollama API using the official SDK
   */
  async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    try {
      // Convert messages to Ollama format
      const ollamaMessages = messages.map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : msg.role === "system" ? "system" : "user",
        content: msg.content || "",
      }));

      const options: {
        model: string;
        messages: Array<{ role: string; content: string }>;
        tools?: Tool[];
      } = {
        model: this.model,
        messages: ollamaMessages,
      };

      // Add tools if available and supported
      if (this.supportsTools && this.tools.length > 0) {
        options.tools = this.tools.map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters as {
              type?: string;
              $defs?: unknown;
              items?: unknown;
              required?: string[];
              properties?: Record<string, {
                type?: string | string[];
                items?: unknown;
                description?: string;
                enum?: unknown[];
              }>;
            },
          },
        }));
      }

      const response = await this.client.chat(options);

      // Extract content and tool calls
      const content = response.message?.content || "";
      const toolCalls: ToolCall[] | null = response.message?.tool_calls?.map((tc, idx) => ({
        id: `call_${Date.now()}_${idx}`,
        name: tc.function?.name || "",
        input: tc.function?.arguments as Record<string, unknown> || {},
      })) || null;

      return {
        content: content || (toolCalls?.length && toolCalls[0] ? `Calling tool ${toolCalls[0].name}` : ""),
        toolCalls,
      };
    } catch (error) {
      console.error("Ollama API error:", error);
      throw new Error(
        `Ollama API error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}