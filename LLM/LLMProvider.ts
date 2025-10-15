import type { LLMMessage, LLMProvider, LLMResponse } from "../Models/LLM";
import type { LLMSpecTool, ToolExecutor } from "../Models/Tool";
export class OpenAIProvider implements LLMProvider {
  private model: string;
  private apiKey: string;
  private tools: LLMSpecTool[] = [];
  private toolExecutor?: ToolExecutor;

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
   * Unified entry point for generating text or running tool calls automatically
   */
  async generateText(prompt: string): Promise<string> {
    const messages: LLMMessage[] = [{ role: "user", content: prompt }];

    // Call the LLM once
    const response = await this.callLLM(messages);

    // If there are tool calls, handle them automatically
    if (response.toolCalls && response.toolCalls.length > 0) {
      return await this.handleToolCalls(response, prompt);
    }

    // Otherwise return the plain text
    return response.content || "";
  }

  /**
   * Handles tool execution and final follow-up model call
   */
  async handleToolCalls(
    response: LLMResponse,
    prompt: string
  ): Promise<string> {
    const toolCalls = response.toolCalls!;
    const toolMessages: any[] = [];

    // Execute each tool
    for (const call of toolCalls) {
      const tool = this.tools.find((t) => t.name == call.name);
      if (!tool?.executor) continue;
      const result = await tool.executor(call.input);

      toolMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }

    // The correct follow-up structure (from OpenAI tool calling spec)
    const followUpMessages = [
      { role: "user", content: prompt },
      {
        role: "assistant",
        content: null,
        tool_calls: toolCalls.map((t) => ({
          id: t.id,
          type: "function",
          function: {
            name: t.name,
            arguments: JSON.stringify(t.input),
          },
        })),
      },
      ...toolMessages,
    ];

    const followUpResponse = await this.callLLM(followUpMessages);
    return followUpResponse.content || "";
  }

  /**
   * Makes a raw call to the OpenAI API
   */
  async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    const body: any = {
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

    const json = await res.json();
    const message = (json as any).choices?.[0]?.message;

    if (!message) {
      throw new Error("Invalid OpenAI response format");
    }

    const rawContent: string | null = message.content ?? null;
    const toolCalls =
      message.tool_calls?.map((t: any) => ({
        id: t.id,
        name: t.function?.name,
        input: JSON.parse(t.function?.arguments || "{}"),
      })) || null;

    const content =
      rawContent ||
      (toolCalls?.length ? `Calling tool ${toolCalls[0].name}` : "");

    return { content, toolCalls };
  }
}

export class GroqProvider implements LLMProvider {
  private model: string;
  private apiKey: string;
  private tools: LLMSpecTool[] = [];
  private toolExecutor?: ToolExecutor;

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
   * Unified entry point for generating text or running tool calls automatically
   */
  async generateText(prompt: string): Promise<string> {
    const messages: LLMMessage[] = [{ role: "user", content: prompt }];

    // Call the LLM once
    const response = await this.callLLM(messages);

    // If there are tool calls, handle them automatically
    if (response.toolCalls && response.toolCalls.length > 0) {
      return await this.handleToolCalls(response, prompt);
    }

    // Otherwise return the plain text
    return response.content || "";
  }

  /**
   * Handles tool execution and final follow-up model call
   */
  async handleToolCalls(
    response: LLMResponse,
    prompt: string
  ): Promise<string> {
    const toolCalls = response.toolCalls!;
    const toolMessages: any[] = [];

    // Execute each tool
    for (const call of toolCalls) {
      const tool = this.tools.find((t) => t.name == call.name);
      if (!tool?.executor) continue;
      const result = await tool.executor(call.input);

      toolMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }

    // Follow-up structure for Groq (OpenAI-compatible)
    const followUpMessages = [
      { role: "user", content: prompt },
      {
        role: "assistant",
        content: null,
        tool_calls: toolCalls.map((t) => ({
          id: t.id,
          type: "function",
          function: {
            name: t.name,
            arguments: JSON.stringify(t.input),
          },
        })),
      },
      ...toolMessages,
    ];

    console.log(
      "FOLLOW-UP MESSAGES:",
      JSON.stringify(followUpMessages, null, 2)
    );

    const followUpResponse = await this.callLLM(followUpMessages);
    return followUpResponse.content || "";
  }

  /**
   * Makes a raw call to the Groq API
   */
  async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    const body: any = {
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
      throw new Error(`Chat API returned status ${res.status}`);
    }

    const json = await res.json();

    const message = (json as any).choices[0].message;
    if (!message) {
      throw new Error("Invalid Groq response format");
    }

    // Extract both content and tool calls safely
    const rawContent: string | null = message.content ?? null;
    const toolCalls =
      message.tool_calls?.map((t: any) => ({
        id: t.id,
        name: t.function?.name,
        input: JSON.parse(t.function?.arguments || "{}"),
      })) || null;

    const content =
      rawContent ||
      (toolCalls?.length ? `calling tool ${toolCalls[0].name}` : "");

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
   * Unified entry point for generating text or running tool calls automatically
   */
  async generateText(prompt: string): Promise<string> {
    const messages: LLMMessage[] = [{ role: "user", content: prompt }];

    // Call the LLM once
    const response = await this.callLLM(messages);

    // If there are tool calls, handle them automatically
    if (response.toolCalls && response.toolCalls.length > 0) {
      return await this.handleToolCalls(response, prompt);
    }

    // Otherwise return the plain text
    return response.content || "";
  }

  /**
   * Handles tool execution and final follow-up model call
   */
  async handleToolCalls(
    response: LLMResponse,
    prompt: string
  ): Promise<string> {
    const toolCalls = response.toolCalls!;
    const toolMessages: any[] = [];

    // Execute each tool
    for (const call of toolCalls) {
      const tool = this.tools.find((t) => t.name == call.name);
      if (!tool?.executor) continue;
      const result = await tool.executor(call.input);

      toolMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }

    // Follow-up structure for OpenRouter (OpenAI-compatible)
    const followUpMessages = [
      { role: "user", content: prompt },
      {
        role: "assistant",
        content: null,
        tool_calls: toolCalls.map((t) => ({
          id: t.id,
          type: "function",
          function: {
            name: t.name,
            arguments: JSON.stringify(t.input),
          },
        })),
      },
      ...toolMessages,
    ];

    console.log(
      "FOLLOW-UP MESSAGES:",
      JSON.stringify(followUpMessages, null, 2)
    );

    const followUpResponse = await this.callLLM(followUpMessages);
    return followUpResponse.content || "";
  }

  /**
   * Makes a raw call to the OpenRouter API
   */
  async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    const body: any = {
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
    const message = (json as any).choices?.[0]?.message;
    if (!message) {
      throw new Error("Invalid OpenRouter response format");
    }

    // Extract both content and tool calls safely
    const rawContent: string | null = message.content ?? null;
    const toolCalls =
      message.tool_calls?.map((t: any) => ({
        id: t.id,
        name: t.function?.name,
        input: JSON.parse(t.function?.arguments || "{}"),
      })) || null;

    const content =
      rawContent ||
      (toolCalls?.length ? `calling tool ${toolCalls[0].name}` : "");

    return { content, toolCalls };
  }
}
export class GeminiProvider implements LLMProvider {
  private model: string;
  private apiKey: string;
  private tools: LLMSpecTool[] = [];
  private toolExecutor?: ToolExecutor;

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
   * Unified entry point for generating text or running tool calls automatically
   */
  async generateText(prompt: string): Promise<string> {
    const response = await this.callLLM([{ role: "user", content: prompt }]);
    console.log("GEM RESPONL:", response);

    // If the model requested a tool call, execute it automatically
    if (response.toolCalls && response.toolCalls.length > 0) {
      return await this.handleToolCalls(response, prompt);
    }

    // Otherwise return normal text
    return response.content || "";
  }

  /**
   * Handles Gemini function calls and makes a follow-up LLM request
   */
  async handleToolCalls(
    response: LLMResponse,
    prompt: string
  ): Promise<string> {
    const toolCalls = response.toolCalls!;
    const toolResults: any[] = [];

    // Execute each tool
    for (const call of toolCalls) {
      const tool = this.tools.find((t) => t.name == call.name);
      if (!tool?.executor) continue;
      const result = await tool.executor(call.input);

      toolResults.push({
        functionResponse: {
          name: call.name,
          response: result,
        },
      });
    }

    // Create follow-up messages in LLMMessage format for callLLM
    const followUpMessages: LLMMessage[] = [
      { role: "user", content: prompt },
      {
        role: "assistant",
        content: toolCalls
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

    console.log(
      "FOLLOW-UP MESSAGES:",
      JSON.stringify(followUpMessages, null, 2)
    );

    const followUpResponse = await this.callLLM(followUpMessages);
    return followUpResponse.content || "";
  }

  /**
   * Makes a raw call to the Gemini API
   */
  async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    const body: any = {
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

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${this.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const error = await res.text();
      console.error("Gemini API error body:", error);
      throw new Error(`Gemini API returned status ${res.status}`);
    }

    const json = await res.json();

    const candidates = (json as any).candidates ?? [];
    const first = candidates[0];
    const parts = first?.content?.parts ?? [];

    const rawContent = parts.find((p: any) => p.text)?.text ?? null;

    const functionCalls =
      parts
        .filter((p: any) => p.functionCall)
        .map((p: any) => ({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: p.functionCall.name,
          input: p.functionCall.args,
        })) || [];

    const content =
      rawContent ||
      (functionCalls.length ? `calling tool ${functionCalls[0].name}` : "");

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
  private toolExecutor?: ToolExecutor;

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
   * Unified entry point for generating text or running tool calls automatically
   */
  async generateText(prompt: string): Promise<string> {
    const messages: LLMMessage[] = [{ role: "user", content: prompt }];

    // Call the LLM once
    const response = await this.callLLM(messages);

    // If there are tool calls, handle them automatically
    if (response.toolCalls && response.toolCalls.length > 0) {
      return await this.handleToolCalls(response, prompt);
    }

    // Otherwise return the plain text
    return response.content || "";
  }

  /**
   * Handles tool execution and final follow-up model call
   */
  async handleToolCalls(
    response: LLMResponse,
    prompt: string
  ): Promise<string> {
    const toolCalls = response.toolCalls!;
    const toolMessages: any[] = [];

    // Execute each tool
    for (const call of toolCalls) {
      const tool = this.tools.find((t) => t.name == call.name);
      if (!tool?.executor) continue;
      const result = await tool.executor(call.input);

      toolMessages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: call.id,
            content: JSON.stringify(result),
          },
        ],
      });
    }

    // Claude-specific follow-up structure
    const followUpMessages = [
      { role: "user", content: prompt },
      {
        role: "assistant",
        content: toolCalls.map((call) => ({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: call.input,
        })),
      },
      ...toolMessages,
    ];

    const followUpResponse = await this.callLLM(followUpMessages);
    return followUpResponse.content || "";
  }

  /**
   * Makes a raw call to the Claude API
   */
  async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    const body: any = {
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

    const json = await res.json();
    const content = (json as any).content ?? [];

    const toolUses =
      content
        ?.filter((item: any) => item.type === "tool_use")
        ?.map((item: any) => ({
          id: item.id,
          name: item.name,
          input: item.input,
        })) || null;

    // 🔍 Detect normal text content
    const textPart = content?.find((item: any) => item.type === "text");
    const rawText = textPart?.text ?? null;

    const finalContent =
      rawText || (toolUses?.length ? `calling tool ${toolUses[0].name}` : "");

    return {
      content: finalContent,
      toolCalls: toolUses?.length ? toolUses : null,
    };
  }
}
