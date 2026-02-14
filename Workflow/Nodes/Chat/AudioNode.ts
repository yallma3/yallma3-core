import type {
  BaseNode,
  Position,
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  NodeMetadata,
} from "../../types/types";
import { NodeRegistry } from "../../NodeRegistry";
import { Ollama } from "ollama";

export interface AudioNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

// Type definitions for API responses
interface OpenAITranscriptionResponse {
  text: string;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
  usageMetadata: {
    totalTokenCount: number;
  };
}

interface GroqTranscriptionResponse {
  text: string;
  language?: string;
  duration?: number;
}

interface OllamaChatResponse {
  message: {
    content: string;
  };
  prompt_eval_count?: number;
  eval_count?: number;
}

const metadata: NodeMetadata = {
  category: "AI",
  title: "Audio AI (Multi-Provider)",
  nodeType: "AudioAI",
  description: "Multi-provider audio AI node for speech-to-text transcription and audio analysis. Works with OpenAI, Gemini, Groq, and Ollama.",
  nodeValue: "openai|gpt-4o-transcribe",
  sockets: [
    { title: "Audio (Base64)", type: "input", dataType: "string" },
    { title: "Prompt", type: "input", dataType: "string" },
    { title: "Language", type: "input", dataType: "string" },
    { title: "Transcription", type: "output", dataType: "string" },
    { title: "Metadata", type: "output", dataType: "string" },
  ],
  width: 400,
  height: 240,
  configParameters: [
    {
      parameterName: "Provider",
      parameterType: "string",
      defaultValue: "openai",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "AI provider to use",
      isNodeBodyContent: true,
      sourceList: [
        { key: "openai", label: "OpenAI" },
        { key: "gemini", label: "Google Gemini" },
        { key: "groq", label: "Groq" },
        { key: "ollama", label: "Ollama (Local)" },
      ],
      i18n: {
        en: { "Provider": { Name: "Provider", Description: "AI provider to use" } },
        ar: { "Provider": { Name: "المزود", Description: "مزود الذكاء الاصطناعي" } },
      },
    },
    {
      parameterName: "Model",
      parameterType: "string",
      defaultValue: "gpt-4o-transcribe",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Audio model to use",
      isNodeBodyContent: true,
    sourceList: [
  // OpenAI Models
  { key: "gpt-4o-transcribe", label: "GPT-4o Transcribe (Best)", provider: "openai" },
  { key: "gpt-4o-mini-transcribe", label: "GPT-4o Mini Transcribe", provider: "openai" },
  
  // Gemini Models
  { key: "gemini-2.5-flash-native-audio-preview-12-2025", label: "Gemini 2.5 Flash Native Audio (Latest)", provider: "gemini" },
  { key: "gemini-2.5-flash-native-audio-preview-09-2025", label: "Gemini 2.5 Flash Native Audio (Sept 2025)", provider: "gemini" },
  { key: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
  { key: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "gemini" },
  { key: "gemini-2.0-flash-001", label: "Gemini 2.0 Flash", provider: "gemini" },
  
  // Groq Models 
  { key: "whisper-large-v3-turbo", label: "Whisper Large V3 Turbo (216x Speed)", provider: "groq" },
  { key: "whisper-large-v3", label: "Whisper Large V3 (Most Accurate)", provider: "groq" },
  { key: "distil-whisper-large-v3-en", label: "Distil Whisper V3 (English Only)", provider: "groq" },
  
  // Ollama Models
  { key: "whisper:large-v3", label: "Whisper Large V3", provider: "ollama" },
  { key: "whisper:medium", label: "Whisper Medium", provider: "ollama" },
  { key: "whisper:small", label: "Whisper Small", provider: "ollama" },
  { key: "whisper:base", label: "Whisper Base", provider: "ollama" },
  { key: "whisper:tiny", label: "Whisper Tiny (Fastest)", provider: "ollama" },
],

      i18n: {
        en: { "Model": { Name: "Model", Description: "Audio model to use" } },
        ar: { "Model": { Name: "النموذج", Description: "نموذج الصوت المستخدم" } },
      },
    },
    {
      parameterName: "Task",
      parameterType: "string",
      defaultValue: "transcribe",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Task to perform",
      isNodeBodyContent: true,
      sourceList: [
        { key: "transcribe", label: "Transcribe (Same Language)" },
        { key: "translate", label: "Translate to English" },
        { key: "analyze", label: "Analyze Audio (Gemini)" },
      ],
      i18n: {
        en: { "Task": { Name: "Task", Description: "Task to perform" } },
        ar: { "Task": { Name: "المهمة", Description: "المهمة المطلوبة" } },
      },
    },
    {
      parameterName: "API Key",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "API Key (not needed for Ollama)",
      isNodeBodyContent: false,
      i18n: {
        en: { "API Key": { Name: "API Key", Description: "API Key for the service" } },
        ar: { "API Key": { Name: "مفتاح API", Description: "مفتاح API للخدمة" } },
      },
    },
    {
      parameterName: "Temperature",
      parameterType: "number",
      defaultValue: 0,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Sampling temperature (0-1, lower = more focused)",
      isNodeBodyContent: false,
      i18n: {
        en: { "Temperature": { Name: "Temperature", Description: "Sampling temperature" } },
        ar: { "Temperature": { Name: "درجة الحرارة", Description: "درجة حرارة العينة" } },
      },
    },
    {
      parameterName: "Response Format",
      parameterType: "string",
      defaultValue: "text",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Output format (OpenAI/Groq only)",
      isNodeBodyContent: false,
      sourceList: [
        { key: "text", label: "Text" },
        { key: "json", label: "JSON" },
        { key: "verbose_json", label: "Verbose JSON" },
        { key: "srt", label: "SRT (Subtitles)" },
        { key: "vtt", label: "VTT (Web Subtitles)" },
      ],
      i18n: {
        en: { "Response Format": { Name: "Response Format", Description: "Output format" } },
        ar: { "Response Format": { Name: "صيغة الرد", Description: "صيغة المخرجات" } },
      },
    },
    {
      parameterName: "Ollama Base URL",
      parameterType: "string",
      defaultValue: "http://localhost:11434",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Ollama server URL (for local models)",
      isNodeBodyContent: false,
      i18n: {
        en: { "Ollama Base URL": { Name: "Ollama Base URL", Description: "Ollama server URL" } },
        ar: { "Ollama Base URL": { Name: "رابط Ollama", Description: "رابط خادم Ollama" } },
      },
    },
  ],
  i18n: {
    en: {
      category: "AI",
      title: "Audio AI (Multi-Provider)",
      nodeType: "Audio AI",
      description: "Multi-provider audio AI for speech-to-text and audio analysis.",
    },
    ar: {
      category: "ذكاء اصطناعي",
      title: "الذكاء الصوتي (متعدد المزودين)",
      nodeType: "الذكاء الصوتي",
      description: "ذكاء صوتي متعدد المزودين لتحويل الكلام إلى نص وتحليل الصوت.",
    },
  },
};

export function createAudioAINode(id: number, position: Position): AudioNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: [
      { id: id * 100 + 1, title: "Audio (Base64)", type: "input", nodeId: id, dataType: "string" },
      { id: id * 100 + 2, title: "Prompt", type: "input", nodeId: id, dataType: "string" },
      { id: id * 100 + 3, title: "Language", type: "input", nodeId: id, dataType: "string" },
      { id: id * 100 + 4, title: "Transcription", type: "output", nodeId: id, dataType: "string" },
      { id: id * 100 + 5, title: "Metadata", type: "output", nodeId: id, dataType: "string" },
    ],
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    selected: false,
    processing: false,
    process: async (context: NodeExecutionContext) => {
      const n = context.node as AudioNode;

      // Get inputs
      const audioInput = await context.inputs[n.id * 100 + 1];
      const promptValue = await context.inputs[n.id * 100 + 2];
      const languageValue = await context.inputs[n.id * 100 + 3];

      // Get configuration
      const getConfigParam = n.getConfigParameter?.bind(n);
      if (!getConfigParam) {
        throw new Error("Configuration parameters not available");
      }

      const provider = (getConfigParam("Provider")?.paramValue as string) || "openai";
      const model = (getConfigParam("Model")?.paramValue as string) || "gpt-4o-transcribe";
      const task = (getConfigParam("Task")?.paramValue as string) || "transcribe";
      const apiKey = (getConfigParam("API Key")?.paramValue as string) || "";
      const temperature = (getConfigParam("Temperature")?.paramValue as number) || 0;
      const responseFormat = (getConfigParam("Response Format")?.paramValue as string) || "text";
      const ollamaBaseUrl = (getConfigParam("Ollama Base URL")?.paramValue as string) || "http://localhost:11434";

      const prompt = String(promptValue || "");
      const language = String(languageValue || "");

      // Process audio input
      let audioBase64 = "";
      if (typeof audioInput === "string") {
        audioBase64 = audioInput.replace(/^data:audio\/[a-z0-9-]+;base64,/i, "").trim();
      }

      if (!audioBase64) {
        return {
          [n.id * 100 + 4]: "Error: No audio provided",
          [n.id * 100 + 5]: "Status: No input",
        };
      }

      try {
        console.log(`🎵 Audio AI Node ${n.id}: Provider=${provider}, Model=${model}, Task=${task}`);

        let transcription = "";
        let metadata = "";

        // Route to appropriate provider
        switch (provider.toLowerCase()) {
          case "openai": {
            ({ transcription, metadata } = await processOpenAI(
              model,
              task,
              audioBase64,
              apiKey,
              prompt,
              language,
              temperature,
              responseFormat
            ));
            break;
          }

          case "gemini": {
            ({ transcription, metadata } = await processGemini(
              model,
              task,
              audioBase64,
              apiKey,
              prompt
            ));
            break;
          }

          case "groq": {
            ({ transcription, metadata } = await processGroq(
              model,
              task,
              audioBase64,
              apiKey,
              prompt,
              language,
              temperature,
              responseFormat
            ));
            break;
          }

          case "ollama": {
            ({ transcription, metadata } = await processOllama(
              model,
              task,
              audioBase64,
              ollamaBaseUrl,
              prompt
            ));
            break;
          }

          default: {
            throw new Error(`Unsupported provider: ${provider}`);
          }
        }

        return {
          [n.id * 100 + 4]: transcription,
          [n.id * 100 + 5]: metadata,
        };

      } catch (error) {
        console.error(`❌ Error in Audio AI node ${n.id}:`, error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        return {
          [n.id * 100 + 4]: `Error: ${errorMsg}`,
          [n.id * 100 + 5]: "Status: Failed",
        };
      }
    },
    configParameters: metadata.configParameters,
    getConfigParameters: function (): ConfigParameterType[] {
      return this.configParameters || [];
    },
    getConfigParameter(parameterName: string): ConfigParameterType | undefined {
      return (this.configParameters ?? []).find((p) => p.parameterName === parameterName);
    },
    setConfigParameter(parameterName: string, value: string | number | boolean): void {
      const param = (this.configParameters ?? []).find((p) => p.parameterName === parameterName);
      if (param) {
        param.paramValue = value;
      }
    },
  };
}

// Provider-specific processing functions
async function processOpenAI(
  model: string,
  task: string,
  audioBase64: string,
  apiKey: string,
  prompt: string,
  language: string,
  temperature: number,
  responseFormat: string
): Promise<{ transcription: string; metadata: string }> {
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
  
  const formData = new FormData();
  formData.append('file', blob, 'audio.mp3');
  formData.append('model', model);
  
  if (prompt) formData.append('prompt', prompt);
  if (language) formData.append('language', language);
  if (temperature !== undefined) formData.append('temperature', temperature.toString());
  if (responseFormat) formData.append('response_format', responseFormat);

  const endpoint = task === 'translate' 
    ? 'https://api.openai.com/v1/audio/translations'
    : 'https://api.openai.com/v1/audio/transcriptions';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI API error: ${res.status} - ${errorText}`);
  }

  const json = await res.json() as OpenAITranscriptionResponse;
  
  return {
    transcription: json.text || "",
    metadata: `Provider: OpenAI | Model: ${model} | Task: ${task}`,
  };
}

async function processGemini(
  model: string,
  task: string,
  audioBase64: string,
  apiKey: string,
  prompt: string
): Promise<{ transcription: string; metadata: string }> {
  const userPrompt = task === 'analyze' 
    ? (prompt || "Analyze this audio and provide a detailed description of its content.")
    : (prompt || "Transcribe this audio accurately.");

  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inline_data: {
              mime_type: "audio/mp3",
              data: audioBase64,
            },
          },
          { text: userPrompt },
        ],
      },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }
  );

  clearTimeout(timeoutId);

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  
  const json = await res.json() as GeminiResponse;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const tokens = json.usageMetadata?.totalTokenCount || 0;

  return {
    transcription: text,
    metadata: `Provider: Gemini | Model: ${model} | Tokens: ${tokens}`,
  };
}

async function processGroq(
  model: string,
  task: string,
  audioBase64: string,
  apiKey: string,
  prompt: string,
  language: string,
  temperature: number,
  responseFormat: string
): Promise<{ transcription: string; metadata: string }> {
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
  
  const formData = new FormData();
  formData.append('file', blob, 'audio.mp3');
  formData.append('model', model);
  
  if (prompt) formData.append('prompt', prompt);
  if (language) formData.append('language', language);
  if (temperature !== undefined) formData.append('temperature', temperature.toString());
  if (responseFormat) formData.append('response_format', responseFormat);

  const endpoint = task === 'translate' 
    ? 'https://api.groq.com/openai/v1/audio/translations'
    : 'https://api.groq.com/openai/v1/audio/transcriptions';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Groq API error: ${res.status} - ${errorText}`);
  }

  const json = await res.json() as GroqTranscriptionResponse;
  
  return {
    transcription: json.text || "",
    metadata: `Provider: Groq | Model: ${model} | Task: ${task}`,
  };
}

async function processOllama(
  model: string,
  task: string,
  audioBase64: string,
  baseUrl: string,
  prompt: string
): Promise<{ transcription: string; metadata: string }> {
  const ollama = new Ollama({ host: baseUrl });

  if (task === "analyze") {
    const userPrompt = prompt || "Analyze this audio and describe its content in detail.";
    const response = await ollama.chat({
      model,
      messages: [
        {
          role: "user",
          content: userPrompt,
          images: [audioBase64],
        },
      ],
    }) as OllamaChatResponse;

    return {
      transcription: response.message?.content || "",
      metadata: `Provider: Ollama | Model: ${model} | Local | Task: ${task}`,
    };
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer]), "audio.wav");
  formData.append("model", model);
  if (prompt) formData.append("prompt", prompt);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  const res = await fetch(`${baseUrl}/api/transcribe`, {
    method: "POST",
    body: formData,
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Ollama transcription error: ${res.status} - ${errorText}`);
  }

  const json = await res.json() as { text?: string };
  return {
    transcription: json.text || "",
    metadata: `Provider: Ollama | Model: ${model} | Local | Task: ${task}`,
  };
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType("AudioAI", createAudioAINode, metadata);
}