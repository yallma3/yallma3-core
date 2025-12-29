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

export interface ImageNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "Text",
  title: "Image Input",
  nodeType: "ImageInput",
  description: "Load and output images as Base64 strings. Supports file upload, URL input, or direct Base64 input. Works in both browser and Node.js environments.",
  nodeValue: "",
  sockets: [
    { title: "Image URL", type: "input", dataType: "string" },
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
      description: "How to provide the image",
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
            Description: "How to provide the image",
          },
        },
        ar: {
          "Input Method": {
            Name: "طريقة الإدخال",
            Description: "كيفية توفير الصورة",
          },
        },
      },
    },
    {
      parameterName: "Image Upload",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Upload an image file (PNG, JPEG, WebP, etc.)",
      isNodeBodyContent: false,
      acceptedFileTypes: "image/*", 
      i18n: {
        en: {
          "Image Upload": {
            Name: "Image Upload",
            Description: "Upload an image file (PNG, JPEG, WebP, etc.)",
          },
        },
        ar: {
          "Image Upload": {
            Name: "تحميل الصورة",
            Description: "تحميل ملف صورة (PNG, JPEG, WebP, إلخ)",
          },
        },
      },
    },
    {
      parameterName: "Image Data",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Image URL or Base64 string (when not using upload)",
      isNodeBodyContent: false,
      i18n: {
        en: {
          "Image Data": {
            Name: "Image Data",
            Description: "Image URL or Base64 string",
          },
        },
        ar: {
          "Image Data": {
            Name: "بيانات الصورة",
            Description: "رابط الصورة أو نص Base64",
          },
        },
      },
    },
  ],
  i18n: {
    en: {
      category: "Text",
      title: "Image Input",
      nodeType: "Image Input",
      description: "Load and convert images to Base64 for AI vision models",
    },
    ar: {
      category: "نص",
      title: "إدخال صورة",
      nodeType: "إدخال صورة",
      description: "تحميل وتحويل الصور إلى Base64 لنماذج الرؤية الذكية",
    },
  },
};

export function createImageInputNode(id: number, position: Position): ImageNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: [
      {
        id: id * 100 + 1,
        title: "Image URL",
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
      const n = context.node as ImageNode;

      try {
        let inputMethod = "upload";
        let imageData = "";

        if (n.getConfigParameter) {
          inputMethod =
            (n.getConfigParameter("Input Method")?.paramValue as string) || "upload";
          
          // Check for uploaded file first
          const uploadedFile = n.getConfigParameter("Image Upload")?.paramValue as string;
          if (uploadedFile && uploadedFile.trim()) {
            imageData = uploadedFile.trim();
            inputMethod = "upload";
          } else {
            // Fall back to Image Data parameter
            imageData = (n.getConfigParameter("Image Data")?.paramValue as string) || "";
          }
        }

        // Check for URL input from socket (overrides config)
        const urlInput = await context.inputs[n.id * 100 + 1];
        if (urlInput && typeof urlInput === "string" && urlInput.trim()) {
          inputMethod = "url";
          imageData = String(urlInput).trim();
        }

        console.log(
          `Image Input Node ${n.id}: Method="${inputMethod}" Data="${imageData.substring(0, 50)}..."`
        );

        let base64Image = "";
        let imageInfo = "";

        // Process based on input method
        switch (inputMethod) {
          case "upload": {
            if (!imageData) {
              throw new Error("No file uploaded. Please upload an image using the 'Image Upload' field.");
            }

            console.log(`Processing uploaded image...`);

            base64Image = imageData.trim();

            base64Image = base64Image.replace(/^data:image\/[a-z]+;base64,/i, "");

            // Validate base64
            if (!isValidBase64(base64Image)) {
              throw new Error("Invalid image file. Please upload a valid image.");
            }

            imageInfo = `Uploaded file | Size: ${base64Image.length} characters`;
            break;
          }

          case "url": {
            if (!imageData) {
              throw new Error("No URL provided");
            }

            console.log(`Fetching image from URL: ${imageData}`);

            // Fetch image from URL
            const response = await fetch(imageData);
            if (!response.ok) {
              throw new Error(
                `Failed to fetch image: ${response.status} ${response.statusText}`
              );
            }

            // Get image as array buffer
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Convert to base64
            base64Image = buffer.toString("base64");

            // Get image info
            const contentType = response.headers.get("content-type") || "unknown";
            imageInfo = `Loaded from URL: ${imageData.substring(
              0,
              50
            )}... | Type: ${contentType} | Size: ${buffer.length} bytes`;

            break;
          }

          case "base64": {
            if (!imageData) {
              throw new Error("No Base64 data provided");
            }

            // Clean and validate base64
            base64Image = imageData.trim();

            // Remove data URI prefix if present
            base64Image = base64Image.replace(/^data:image\/[a-z]+;base64,/i, "");

            // Validate base64
            if (!isValidBase64(base64Image)) {
              throw new Error("Invalid Base64 string");
            }

            imageInfo = `Direct Base64 input | Length: ${base64Image.length} characters`;
            break;
          }

          default: {
            throw new Error(`Unknown input method: ${inputMethod}`);
          }
        }

        console.log(`Image Input Node ${n.id}: Successfully processed image`);

        return {
          [n.id * 100 + 2]: base64Image, 
          [n.id * 100 + 3]: imageInfo,
        };
      } catch (error) {
        console.error(`Error in Image Input node ${n.id}:`, error);

        let errorMessage = "Unknown error";
        if (error instanceof Error) {
          errorMessage = error.message;

          // Provide helpful error messages
          if (errorMessage.includes("fetch failed") || errorMessage.includes("ENOTFOUND")) {
            errorMessage = `Cannot fetch image from URL. Check if the URL is valid and accessible.`;
          } else if (errorMessage.includes("Failed to fetch")) {
            errorMessage = `Failed to fetch image: ${errorMessage}`;
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
  nodeRegistry.registerNodeType("ImageInput", createImageInputNode, metadata);
}