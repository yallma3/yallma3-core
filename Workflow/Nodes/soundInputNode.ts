/*
 * yaLLMa3 - Framework for building AI agents that are capable of learning from their environment and interacting with it.
 
 * Copyright (C) 2025 yaLLMa3
 
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
   If a copy of the MPL was not distributed with this file, You can obtain one at https://www.mozilla.org/MPL/2.0/.
 
 * This software is distributed on an "AS IS" basis,
   WITHOUT WARRANTY OF ANY KIND, either express or implied.
   See the Mozilla Public License for the specific language governing rights and limitations under the License.
*/
import type {
  BaseNode,
  Position,
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  NodeMetadata,
} from "../types/types";
import { NodeRegistry } from "../NodeRegistry";

export interface SoundNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "Input/Output",
  title: "Sound Input",
  nodeType: "SoundInput",
  description: "Load and output audio files as Base64 strings. Supports file upload, URL input, or direct Base64 input. Works with MP3, WAV, OGG, M4A, and other audio formats in both browser and Node.js environments.",
  nodeValue: "",
  sockets: [
    { title: "Audio URL", type: "input", dataType: "string" },
    { title: "Base64 Output", type: "output", dataType: "string" },
    { title: "Info", type: "output", dataType: "string" },
  ],
  width: 400,
  height: 280,
  configParameters: [
    {
      parameterName: "Input Method",
      parameterType: "string",
      defaultValue: "upload",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "How to provide the audio file",
      isNodeBodyContent: true,
      sourceList: [
        { key: "upload", label: "File Upload" },
        { key: "url", label: "URL" },
        { key: "base64", label: "Direct Base64" },
      ],
      i18n: {
        en: {
          "Input Method": {
            Name: "Input Method",
            Description: "How to provide the audio file",
          },
        },
        ar: {
          "Input Method": {
            Name: "طريقة الإدخال",
            Description: "كيفية توفير ملف الصوت",
          },
        },
      },
    },
    {
      parameterName: "Audio Upload",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Upload an audio file (MP3, WAV, OGG, M4A, etc.)",
      isNodeBodyContent: false,
      acceptedFileTypes: "audio/*",
      i18n: {
        en: {
          "Audio Upload": {
            Name: "Audio Upload",
            Description: "Upload an audio file (MP3, WAV, OGG, M4A, etc.)",
          },
        },
        ar: {
          "Audio Upload": {
            Name: "تحميل الصوت",
            Description: "تحميل ملف صوتي (MP3, WAV, OGG, M4A, إلخ)",
          },
        },
      },
    },
    {
      parameterName: "Audio Data",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Audio URL or Base64 string (when not using upload)",
      isNodeBodyContent: false,
      i18n: {
        en: {
          "Audio Data": {
            Name: "Audio Data",
            Description: "Audio URL or Base64 string",
          },
        },
        ar: {
          "Audio Data": {
            Name: "بيانات الصوت",
            Description: "رابط الصوت أو نص Base64",
          },
        },
      },
    },
  ],
  i18n: {
    en: {
      category: "Input/Output",
      title: "Sound Input",
      nodeType: "Sound Input",
      description: "Load and convert audio files to Base64 for AI audio models",
    },
    ar: {
      category: "إدخال/إخراج",
      title: "إدخال صوت",
      nodeType: "إدخال صوت",
      description: "تحميل وتحويل الملفات الصوتية إلى Base64 لنماذج الصوت الذكية",
    },
  },
};

export function createSoundInputNode(id: number, position: Position): SoundNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: [
      {
        id: id * 100 + 1,
        title: "Audio URL",
        type: "input",
        nodeId: id,
        dataType: "string",
      },
      {
        id: id * 100 + 2,
        title: "Base64 Output",
        type: "output",
        nodeId: id,
        dataType: "string",
      },
      {
        id: id * 100 + 3,
        title: "Info",
        type: "output",
        nodeId: id,
        dataType: "string",
      },
    ],
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    selected: false,
    processing: false,

    process: async (context: NodeExecutionContext) => {
      const n = context.node as SoundNode;

      try {
        let inputMethod = "upload";
        let audioData = "";

        if (n.getConfigParameter) {
          inputMethod =
            (n.getConfigParameter("Input Method")?.paramValue as string) || "upload";
          
          // Check for uploaded file first
          const uploadedFile = n.getConfigParameter("Audio Upload")?.paramValue as string;
          if (uploadedFile && uploadedFile.trim()) {
            audioData = uploadedFile.trim();
            inputMethod = "upload";
          } else {
            // Fall back to Audio Data parameter
            audioData = (n.getConfigParameter("Audio Data")?.paramValue as string) || "";
          }
        }

        // Check for URL input from socket (overrides config)
        const urlInput = await context.inputs[n.id * 100 + 1];
        if (urlInput && typeof urlInput === "string" && urlInput.trim()) {
          inputMethod = "url";
          audioData = String(urlInput).trim();
        }

        console.log(
          `Sound Input Node ${n.id}: Method="${inputMethod}" Data="${audioData.substring(0, 50)}..."`
        );

        let base64Audio = "";
        let audioInfo = "";

        // Process based on input method
        switch (inputMethod) {
          case "upload": {
            if (!audioData) {
              throw new Error("No file uploaded. Please upload an audio file using the 'Audio Upload' field.");
            }

            console.log(`Processing uploaded audio file...`);

            base64Audio = audioData.trim();

            // Remove data URI prefix if present
            base64Audio = base64Audio.replace(/^data:audio\/[a-z0-9-]+;base64,/i, "");

            // Validate base64
            if (!isValidBase64(base64Audio)) {
              throw new Error("Invalid audio file. Please upload a valid audio file.");
            }

            audioInfo = `Uploaded file | Size: ${base64Audio.length} characters`;
            break;
          }

          case "url": {
            if (!audioData) {
              throw new Error("No URL provided");
            }

            console.log(`Fetching audio from URL: ${audioData}`);

            // Fetch audio from URL
            const response = await fetch(audioData);
            if (!response.ok) {
              throw new Error(
                `Failed to fetch audio: ${response.status} ${response.statusText}`
              );
            }

            // Get audio as array buffer
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Convert to base64
            base64Audio = buffer.toString("base64");

            // Get audio info
            const contentType = response.headers.get("content-type") || "unknown";
            audioInfo = `Loaded from URL: ${audioData.substring(
              0,
              50
            )}... | Type: ${contentType} | Size: ${buffer.length} bytes`;

            break;
          }

          case "base64": {
            if (!audioData) {
              throw new Error("No Base64 data provided");
            }

            // Clean and validate base64
            base64Audio = audioData.trim();

            // Remove data URI prefix if present
            base64Audio = base64Audio.replace(/^data:audio\/[a-z0-9-]+;base64,/i, "");

            // Validate base64
            if (!isValidBase64(base64Audio)) {
              throw new Error("Invalid Base64 string");
            }

            audioInfo = `Direct Base64 input | Length: ${base64Audio.length} characters`;
            break;
          }

          default: {
            throw new Error(`Unknown input method: ${inputMethod}`);
          }
        }

        console.log(`Sound Input Node ${n.id}: Successfully processed audio`);

        return {
          [n.id * 100 + 2]: base64Audio,
          [n.id * 100 + 3]: audioInfo,
        };
      } catch (error) {
        console.error(`Error in Sound Input node ${n.id}:`, error);

        let errorMessage = "Unknown error";
        if (error instanceof Error) {
          errorMessage = error.message;

          // Provide helpful error messages
          if (errorMessage.includes("fetch failed") || errorMessage.includes("ENOTFOUND")) {
            errorMessage = `Cannot fetch audio from URL. Check if the URL is valid and accessible.`;
          } else if (errorMessage.includes("Failed to fetch")) {
            errorMessage = `Failed to fetch audio: ${errorMessage}`;
          }
        }

        return {
          [n.id * 100 + 2]: "",
          [n.id * 100 + 3]: `Error: ${errorMessage}`,
        };
      }
    },

    configParameters: metadata.configParameters,

    getConfigParameters: function (): ConfigParameterType[] {
      return this.configParameters || [];
    },

    getConfigParameter(parameterName: string): ConfigParameterType | undefined {
      return (this.configParameters ?? []).find(
        (p) => p.parameterName === parameterName
      );
    },

    setConfigParameter(
      parameterName: string,
      value: string | number | boolean
    ): void {
      const param = (this.configParameters ?? []).find(
        (p) => p.parameterName === parameterName
      );
      if (param) {
        param.paramValue = value;
      }
    },
  };
}

/**
 * Validate Base64 string
 */
function isValidBase64(str: string): boolean {
  if (!str || str.length === 0) return false;

  // Remove whitespace
  str = str.replace(/\s/g, "");

  // Check if valid base64 characters
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(str)) return false;

  // Check if length is valid (must be multiple of 4)
  if (str.length % 4 !== 0) return false;

  return true;
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType("SoundInput", createSoundInputNode, metadata);
}