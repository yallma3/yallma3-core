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
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  NodeMetadata,
  Position,
} from "../types/types";
import { NodeRegistry } from "../NodeRegistry";

export interface ChunkingNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "Text",
  title: "Text Chunking",
  nodeType: "Chunking",
  nodeValue: "Chunks: 0",
  sockets: [
    { title: "Input Text", type: "input", dataType: "string" },
    { title: "Chunks", type: "output", dataType: "json" },
  ],
  width: 380,
  height: 280,
  configParameters: [
    {
      parameterName: "Max Tokens",
      parameterType: "number",
      defaultValue: 200,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Maximum number of tokens per chunk",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Overlap",
      parameterType: "number",
      defaultValue: 50,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Number of overlapping tokens between chunks",
      isNodeBodyContent: false,
    },
  ],
};

// Simple tokenizer implementation for chunking
// This is a basic word-based tokenizer as a substitute for the transformer tokenizer
const simpleTokenize = (text: string): string[] => {
  // Split by whitespace and punctuation, filter out empty strings
  return text
    .split(/\s+|(?=[.,!?;:])|(?<=[.,!?;:])/)
    .filter((token) => token.trim().length > 0);
};

const simpleDetokenize = (tokens: string[]): string => {
  return tokens.join(" ").replace(/\s+([.,!?;:])/g, "$1");
};

// Token-based chunking utility function
const chunkByTokens = (
  text: string,
  maxTokens: number = 200,
  overlap: number = 50
): string[] => {
  const tokens = simpleTokenize(text);
  const chunks: string[] = [];

  for (let i = 0; i < tokens.length; i += maxTokens - overlap) {
    const chunk = tokens.slice(i, i + maxTokens);
    const decoded = simpleDetokenize(chunk);
    chunks.push(decoded);

    // If we've reached the end of tokens, break
    if (i + maxTokens >= tokens.length) {
      break;
    }
  }

  return chunks;
};

export function createChunkingNode(
  id: number,
  position: Position
): ChunkingNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: [
      {
        id: id * 100 + 1,
        title: "Input Text",
        type: "input",
        nodeId: id,
        dataType: "string",
      },
      {
        id: id * 100 + 2,
        title: "Chunks",
        type: "output",
        nodeId: id,
        dataType: "json",
      },
    ],
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    selected: false,
    processing: false,
    process: async (context: NodeExecutionContext) => {
      const n = context.node as ChunkingNode;

      // Get input text
      const inputValue = await context.inputs[n.id * 100 + 1];
      const inputText = String(inputValue || "");

      if (!inputText.trim()) {
        return {
          [n.id * 100 + 2]: JSON.stringify([]),
        };
      }

      // Get configuration parameters
      const maxTokensConfig = n.getConfigParameter?.("Max Tokens");
      const overlapConfig = n.getConfigParameter?.("Overlap");

      const maxTokens = Number(maxTokensConfig?.paramValue) || 200;
      const overlap = Number(overlapConfig?.paramValue) || 50;

      console.log(
        `🔤 Chunking text with max tokens: ${maxTokens}, overlap: ${overlap}`
      );

      // Perform chunking
      const chunks = chunkByTokens(inputText, maxTokens, overlap);

      // Create chunk objects with metadata
      const chunkObjects = chunks.map((chunk, index) => ({
        index: index,
        text: chunk,
        tokenCount: simpleTokenize(chunk).length,
        characterCount: chunk.length,
        wordCount: chunk.split(/\s+/).filter((word) => word.length > 0).length,
      }));

      // Update node value
      n.nodeValue = `Chunks: ${chunks.length}`;

      console.log(`✅ Created ${chunks.length} chunks from input text`);

      return {
        [n.id * 100 + 2]: JSON.stringify(chunkObjects),
      };
    },
    configParameters: metadata.configParameters,
    getConfigParameters: function (): ConfigParameterType[] {
      return this.configParameters || [];
    },
    getConfigParameter(parameterName: string): ConfigParameterType | undefined {
      return (this.configParameters ?? []).find(
        (param) => param.parameterName === parameterName
      );
    },
    setConfigParameter(parameterName: string, value: any): void {
      const parameter = (this.configParameters ?? []).find(
        (param) => param.parameterName === parameterName
      );
      if (parameter) {
        parameter.paramValue = value;
      }
    },
  };
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType(
    metadata.nodeType,
    createChunkingNode,
    metadata
  );
}

// Export utility functions for external use
export { simpleTokenize, simpleDetokenize, chunkByTokens };
