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

type ChunkStrategy =
  | "token"        
  | "sentence"     
  | "paragraph"    
  | "newline"      
  | "fixed_char"   
  | "recursive"   
  | "word";       

const metadata: NodeMetadata = {
  category: "Text",
  title: "Text Chunking",
  nodeType: "Chunking",
  nodeValue: "",
  description:
    "Splits input text into chunks using one of several strategies: Token, Sentence, Paragraph, Newline, Fixed Character, Recursive, or Word.",
  sockets: [
    { title: "Input Text", type: "input",  dataType: "string" },
    { title: "Chunks",     type: "output", dataType: "json"   },
  ],
  width: 380,
  height: 310,
  configParameters: [
    {
      parameterName: "Strategy",
      parameterType: "string",
      defaultValue:  "token",
      valueSource:   "UserInput",
      UIConfigurable: true,
      sourceList: [
        { key: "token",      label: "Token Window"          },
        { key: "sentence",   label: "Sentence"              },
        { key: "paragraph",  label: "Paragraph"             },
        { key: "newline",    label: "Newline"               },
        { key: "fixed_char", label: "Fixed Character"       },
        { key: "recursive",  label: "Recursive (LangChain)" },
        { key: "word",       label: "Word Window"           },
      ],
      description: "Strategy used to split the text into chunks",
      isNodeBodyContent: false,
      i18n: {
        en: { Strategy: { Name: "Strategy", Description: "Chunking strategy" } },
        ar: { Strategy: { Name: "الاستراتيجية", Description: "استراتيجية التقسيم" } },
      },
    },
    {
      parameterName: "Max Tokens",
      parameterType: "number",
      defaultValue: 200,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Maximum tokens (or words) per chunk",
      isNodeBodyContent: false,
      i18n: {
        en: { "Max Tokens": { Name: "Max Tokens",         Description: "Maximum tokens per chunk" } },
        ar: { "Max Tokens": { Name: "الحد الأقصى للرموز", Description: "الحد الأقصى لعدد الرموز" } },
      },
    },
    {
      parameterName: "Overlap",
      parameterType: "number",
      defaultValue: 50,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Number of overlapping tokens / chars / words between chunks",
      isNodeBodyContent: false,
      i18n: {
        en: { Overlap: { Name: "Overlap",    Description: "Overlap between chunks" } },
        ar: { Overlap: { Name: "التداخل",   Description: "التداخل بين الأجزاء"   } },
      },
    },
    // ── Char Limit (fixed_char / recursive) ─────────────────────────────────
    {
      parameterName: "Char Limit",
      parameterType: "number",
      defaultValue:  500,
      valueSource:   "UserInput",
      UIConfigurable: true,
      description: "Maximum characters per chunk (Fixed Character & Recursive strategies)",
      isNodeBodyContent: false,
      i18n: {
        en: { "Char Limit": { Name: "Char Limit",       Description: "Max characters per chunk" } },
        ar: { "Char Limit": { Name: "حد الأحرف",       Description: "الحد الأقصى للأحرف"      } },
      },
    },
    // ── Max Sentences (sentence strategy) ───────────────────────────────────
    {
      parameterName: "Max Sentences",
      parameterType: "number",
      defaultValue:  5,
      valueSource:   "UserInput",
      UIConfigurable: true,
      description: "Number of sentences per chunk (Sentence strategy)",
      isNodeBodyContent: false,
      i18n: {
        en: { "Max Sentences": { Name: "Max Sentences",      Description: "Sentences per chunk" } },
        ar: { "Max Sentences": { Name: "الحد الأقصى للجمل", Description: "جمل لكل جزء"         } },
      },
    },
    // ── Max Paragraphs (paragraph strategy) ─────────────────────────────────
    {
      parameterName: "Max Paragraphs",
      parameterType: "number",
      defaultValue:  1,
      valueSource:   "UserInput",
      UIConfigurable: true,
      description: "Number of paragraphs per chunk (Paragraph strategy)",
      isNodeBodyContent: false,
      i18n: {
        en: { "Max Paragraphs": { Name: "Max Paragraphs",         Description: "Paragraphs per chunk" } },
        ar: { "Max Paragraphs": { Name: "الحد الأقصى للفقرات",   Description: "فقرات لكل جزء"        } },
      },
    },
    // ── Max Lines (newline strategy) ─────────────────────────────────────────
    {
      parameterName: "Max Lines",
      parameterType: "number",
      defaultValue:  1,
      valueSource:   "UserInput",
      UIConfigurable: true,
      description: "Number of lines per chunk (Newline strategy)",
      isNodeBodyContent: false,
      i18n: {
        en: { "Max Lines": { Name: "Max Lines",          Description: "Lines per chunk" } },
        ar: { "Max Lines": { Name: "الحد الأقصى للسطور", Description: "سطور لكل جزء"   } },
      },
    },
  ],
  i18n: {
    en: {
      category: "Text",
      title: "Text Chunking",
      nodeType: "Text Chunking",
      description: "Splits input text into chunks using multiple strategies.",
    },
    ar: {
      category: "نص",
      title: "تقسيم النص",
      nodeType: "تقسيم النص",
      description: "يقسّم النص باستخدام استراتيجيات متعددة.",
    },
  },
};

// ===========================================================================
// Tokenizer helpers (word-based — no external dependency)
// ===========================================================================

export const simpleTokenize = (text: string): string[] =>
  text
    .split(/\s+|(?=[.,!?;:])|(?<=[.,!?;:])/)
    .filter((t) => t.trim().length > 0);

export const simpleDetokenize = (tokens: string[]): string =>
  tokens.join(" ").replace(/\s+([.,!?;:])/g, "$1");

export const chunkByTokens = (
  text: string,
  maxTokens = 200,
  overlap   = 50
): string[] => {
  const tokens = simpleTokenize(text);
  const chunks: string[] = [];
  const step = Math.max(1, maxTokens - overlap);

  for (let i = 0; i < tokens.length; i += step) {
    chunks.push(simpleDetokenize(tokens.slice(i, i + maxTokens)));
    if (i + maxTokens >= tokens.length) break;
  }
  return chunks;
};

const chunkBySentence = (text: string, maxSentences = 5): string[] => {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += maxSentences) {
    chunks.push(sentences.slice(i, i + maxSentences).join(" "));
  }
  return chunks;
};

const chunkByParagraph = (text: string, maxParagraphs = 1): string[] => {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  for (let i = 0; i < paragraphs.length; i += maxParagraphs) {
    chunks.push(paragraphs.slice(i, i + maxParagraphs).join("\n\n"));
  }
  return chunks;
};

const chunkByNewline = (text: string, maxLines = 1): string[] => {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    chunks.push(lines.slice(i, i + maxLines).join("\n"));
  }
  return chunks;
};

const chunkByFixedChar = (
  text: string,
  charLimit = 500,
  overlap   = 0
): string[] => {
  const chunks: string[] = [];
  const step = Math.max(1, charLimit - overlap);

  for (let i = 0; i < text.length; i += step) {
    chunks.push(text.slice(i, i + charLimit));
    if (i + charLimit >= text.length) break;
  }
  return chunks;
};

const chunkByRecursive = (
  text:      string,
  charLimit  = 500,
  overlap    = 0,
  separators = ["\n\n", "\n", ". ", " ", ""]
): string[] => {
  const merge = (parts: string[], sep: string): string[] => {
    const merged: string[] = [];
    let current = "";

    for (const part of parts) {
      const candidate = current ? current + sep + part : part;
      if (candidate.length <= charLimit) {
        current = candidate;
      } else {
        if (current) merged.push(current);
        current = part;
      }
    }
    if (current) merged.push(current);

    if (overlap > 0 && merged.length > 1) {
      const overlapped: string[] = [merged[0] ?? ""];
      for (let i = 1; i < merged.length; i++) {
        const prev: string = merged[i - 1] ?? "";
        const cur:  string = merged[i]     ?? "";
        const tail = prev.slice(Math.max(0, prev.length - overlap));
        overlapped.push(tail + sep + cur);
      }
      return overlapped;
    }
    return merged;
  };

  const split = (t: string, seps: string[]): string[] => {
    if (!t.trim()) return [];
    if (t.length <= charLimit) return [t];

    const [sep, ...rest] = seps;

    if (sep === undefined) return [t]; 

    const parts = t.split(sep).filter((p) => p.length > 0);

    if (parts.length === 1) {
      return split(t, rest);
    }

    const merged = merge(parts, sep);
    return merged.flatMap((piece) =>
      piece.length <= charLimit ? [piece] : split(piece, rest)
    );
  };

  return split(text, separators);
};
const chunkByWord = (
  text:     string,
  maxWords  = 200,
  overlap   = 50
): string[] => {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const chunks: string[] = [];
  const step = Math.max(1, maxWords - overlap);

  for (let i = 0; i < words.length; i += step) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
    if (i + maxWords >= words.length) break;
  }
  return chunks;
};

const runStrategy = (
  text:         string,
  strategy:     ChunkStrategy,
  maxTokens:    number,
  overlap:      number,
  charLimit:    number,
  maxSentences: number,
  maxParagraphs: number,
  maxLines:     number
): string[] => {
  switch (strategy) {
    case "sentence":   return chunkBySentence(text, maxSentences);
    case "paragraph":  return chunkByParagraph(text, maxParagraphs);
    case "newline":    return chunkByNewline(text, maxLines);
    case "fixed_char": return chunkByFixedChar(text, charLimit, overlap);
    case "recursive":  return chunkByRecursive(text, charLimit, overlap);
    case "word":       return chunkByWord(text, maxTokens, overlap);
    case "token":
    default:           return chunkByTokens(text, maxTokens, overlap);
  }
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
      { id: id * 100 + 1, title: "Input Text", type: "input",  nodeId: id, dataType: "string" },
      { id: id * 100 + 2, title: "Chunks",     type: "output", nodeId: id, dataType: "json"   },
    ],
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    selected: false,
    processing: false,
    process: async (context: NodeExecutionContext) => {
      const n = context.node as ChunkingNode;

      const inputText = String((await context.inputs[n.id * 100 + 1]) || "");
      if (!inputText.trim()) {
        return { [n.id * 100 + 2]: JSON.stringify([]) };
      }

      const getNum = (name: string, fallback: number) =>
        Number(n.getConfigParameter?.(name)?.paramValue) || fallback;
      const getStr = (name: string, fallback: string) =>
        String(n.getConfigParameter?.(name)?.paramValue || fallback);

      const strategy     = getStr("Strategy",      "token")      as ChunkStrategy;
      const maxTokens    = getNum("Max Tokens",    200);
      const overlap      = getNum("Overlap",        50);
      const charLimit    = getNum("Char Limit",    500);
      const maxSentences = getNum("Max Sentences",   5);
      const maxParagraphs= getNum("Max Paragraphs",  1);
      const maxLines     = getNum("Max Lines",       1);

      console.log(`🔤 Chunking — strategy: ${strategy}`);

      const rawChunks = runStrategy(
        inputText,
        strategy,
        maxTokens,
        overlap,
        charLimit,
        maxSentences,
        maxParagraphs,
        maxLines
      );

      const chunkObjects = rawChunks
        .map((chunk, index) => ({
          index,
          text:           chunk,
          tokenCount:     simpleTokenize(chunk).length,
          characterCount: chunk.length,
          wordCount:      chunk.split(/\s+/).filter((w) => w.length > 0).length,
        }));

      n.nodeValue = `Chunks: ${chunkObjects.length}`;
      console.log(`✅ Created ${chunkObjects.length} chunks (strategy: ${strategy})`);

      return { [n.id * 100 + 2]: JSON.stringify(chunkObjects) };
    },

    configParameters: metadata.configParameters,
    getConfigParameters(): ConfigParameterType[] { return this.configParameters || []; },
    getConfigParameter(name: string): ConfigParameterType | undefined {
      return (this.configParameters ?? []).find((p) => p.parameterName === name);
    },
    setConfigParameter(name: string, value: string | number | boolean | undefined): void {
      const p = (this.configParameters ?? []).find((p) => p.parameterName === name);
      if (p) p.paramValue = value;
    },
  };
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType(metadata.nodeType, createChunkingNode, metadata);
}