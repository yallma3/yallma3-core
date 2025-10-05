export interface LLMProvider {
  generateText(prompt: string): Promise<string>;
}

export class OpenAIProvider implements LLMProvider {
  private model: string;
  private apiKey: string;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async generateText(prompt: string): Promise<string> {
    const messages = [{ role: "user", content: prompt }];

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API returned status ${res.status}`);
    }

    const json = await res.json();

    return (
      (json as { choices?: Array<{ message?: { content?: string } }> })
        ?.choices?.[0]?.message?.content || "No response from OpenAI"
    );
  }
}

export class GroqProvider implements LLMProvider {
  private model: string;
  private apiKey: string;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async generateText(prompt: string): Promise<string> {
    console.log(this.model);
    const messages = [{ role: "user", content: prompt }];
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        temperature: 0.7,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      }),
    });

    if (!res.ok) {
      throw new Error(`Chat API returned status ${res.status}`);
    }

    const json = await res.json();

    return (json as any).choices[0].message.content;
  }
}

export class OpenRouterProvider implements LLMProvider {
  private model: string;
  private apiKey: string;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async generateText(prompt: string): Promise<string> {
    const messages = [{ role: "user", content: prompt }];

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.7,
        top_p: 1,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter API returned status ${res.status}`);
    }

    const json = await res.json();

    return (
      (json as { choices?: Array<{ message?: { content?: string } }> })
        ?.choices?.[0]?.message?.content || "No response from OpenRouter"
    );
  }
}

export class GeminiProvider implements LLMProvider {
  private model: string;
  private apiKey: string;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async generateText(prompt: string): Promise<string> {
    const body: any = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        topP: 1,
      },
    };

    // if (system) {
    //   body.systemInstruction = { parts: [{ text: system }] };
    // }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
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
      throw new Error(`Gemini API returned status ${res.status}`);
    }

    const json = await res.json();
    console.log("Gemini API Response:", JSON.stringify(json, null, 2));
    return (
      (
        json as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        }
      )?.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini"
    );
  }
}

export class ClaudeProvider implements LLMProvider {
  private model: string;
  private apiKey: string;

  constructor(model: string, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  async generateText(prompt: string): Promise<string> {
    const messages = [{ role: "user", content: prompt }];
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 4096,
      messages,
      temperature: 0.7,
      top_p: 1,
    };
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

    return (
      (json as { content?: Array<{ text?: string }> })?.content?.[0]?.text ||
      "No response from Claude"
    );
  }
}
