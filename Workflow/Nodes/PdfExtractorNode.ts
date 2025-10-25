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
import { promises as fs } from "fs";
import pdfParse = require("pdf-parse");

export interface PDFTextExtractorNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "Tools",
  title: "PDF Text Extractor",
  nodeType: "PDFTextExtractor",
  nodeValue: "",
  sockets: [
    { title: "Download Results JSON", type: "input", dataType: "string" },
    { title: "Extracted Text", type: "output", dataType: "string" },
  ],
  width: 360,
  height: 280,
  configParameters: [
    {
      parameterName: "Max Pages Per PDF",
      parameterType: "number",
      defaultValue: 50,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Maximum number of pages to extract per PDF",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Include Metadata",
      parameterType: "boolean",
      defaultValue: true,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Include PDF metadata in extraction results",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Min Word Count",
      parameterType: "number",
      defaultValue: 100,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Minimum word count to consider extraction successful",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Clean Text",
      parameterType: "boolean",
      defaultValue: true,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Clean and normalize extracted text",
      isNodeBodyContent: true,
    },
    {
      parameterName: "Extract Images",
      parameterType: "boolean",
      defaultValue: false,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Attempt to extract image descriptions",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Page Range",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description:
        "Specific page range (e.g., '1-5,10,15-20'). Leave empty for all pages up to max.",
      isNodeBodyContent: false,
    },
  ],
};

export function createPDFTextExtractorNode(
  id: number,
  position: Position
): PDFTextExtractorNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: [
      {
        id: id * 100 + 1,
        title: "Download Results JSON",
        type: "input",
        nodeId: id,
        dataType: "string",
      },
      {
        id: id * 100 + 2,
        title: "Extracted Text",
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
      const n = context.node as PDFTextExtractorNode;

      const downloadResultsInput = await context.inputs[n.id * 100 + 1];
      const downloadResultsJson = String(downloadResultsInput || "[]");

      let downloadResults = [];
      try {
        downloadResults = JSON.parse(downloadResultsJson);
        if (!Array.isArray(downloadResults)) {
          throw new Error("Input is not an array");
        }
      } catch (parseError) {
        return {
          [n.id * 100 + 2]: JSON.stringify([
            {
              error: "Invalid download results JSON",
              status: "failed",
            },
          ]),
        };
      }

      // Filter only successful downloads that have filePaths
      const successfulDownloads = downloadResults.filter(
        (result) => result.status === "success" && result.filePath
      );

      if (successfulDownloads.length === 0) {
        return {
          [n.id * 100 + 2]: JSON.stringify([
            {
              error: "No successful downloads with file paths to process",
              status: "failed",
            },
          ]),
        };
      }

      console.log(
        `📖 Starting text extraction for ${successfulDownloads.length} PDFs...`
      );

      const extractionResults = [];

      // Get configuration
      const maxPagesConfig = n.getConfigParameter?.("Max Pages Per PDF");
      const maxPages = Number(maxPagesConfig?.paramValue) || 50;

      const includeMetadataConfig = n.getConfigParameter?.("Include Metadata");
      const includeMetadata =
        includeMetadataConfig?.paramValue !== undefined
          ? Boolean(includeMetadataConfig.paramValue)
          : true;

      const minWordCountConfig = n.getConfigParameter?.("Min Word Count");
      const minWordCount = Number(minWordCountConfig?.paramValue) || 100;

      const cleanTextConfig = n.getConfigParameter?.("Clean Text");
      const cleanText =
        cleanTextConfig?.paramValue !== undefined
          ? Boolean(cleanTextConfig.paramValue)
          : true;

      // Process each successful download
      for (let i = 0; i < successfulDownloads.length; i++) {
        const downloadResult = successfulDownloads[i];

        try {
          console.log(
            `🔍 Extracting text from: ${downloadResult.title} (${downloadResult.filePath})`
          );

          const extractionResult = await extractTextFromPDFFile(
            downloadResult.filePath,
            maxPages,
            includeMetadata,
            cleanText
          );

          // Check minimum word count
          if (extractionResult.wordCount < minWordCount) {
            throw new Error(
              `Extracted text too short: ${extractionResult.wordCount} words (minimum: ${minWordCount})`
            );
          }

          const result = {
            index: downloadResult.index,
            arxivId: downloadResult.arxivId,
            title: downloadResult.title,
            filename: downloadResult.filename,
            filePath: downloadResult.filePath,
            fileSize: downloadResult.fileSize,
            status: "success",
            extractedText: extractionResult.text,
            pageCount: extractionResult.pageCount,
            wordCount: extractionResult.wordCount,
            metadata: extractionResult.metadata,
          };

          extractionResults.push(result);

          console.log(
            `✅ Extracted ${extractionResult.wordCount} words from ${extractionResult.pageCount} pages`
          );
        } catch (error) {
          const errorResult = {
            index: downloadResult.index,
            arxivId: downloadResult.arxivId,
            title: downloadResult.title,
            filename: downloadResult.filename,
            filePath: downloadResult.filePath,
            fileSize: downloadResult.fileSize,
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
            extractedText: "",
            pageCount: 0,
            wordCount: 0,
            metadata: {},
          };

          extractionResults.push(errorResult);
          console.error(
            `❌ Failed to extract text from ${downloadResult.title}: ${error}`
          );
        }
      }

      const successCount = extractionResults.filter(
        (r) => r.status === "success"
      ).length;
      const totalWords = extractionResults.reduce(
        (sum, r) => sum + r.wordCount,
        0
      );

      console.log(
        `🏁 Text extraction complete: ${successCount}/${successfulDownloads.length} processed successfully`
      );
      console.log(`📊 Total words extracted: ${totalWords.toLocaleString()}`);

      // Return the extraction results
      return {
        [n.id * 100 + 2]: JSON.stringify(extractionResults),
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
    setConfigParameter(parameterName, value): void {
      const parameter = (this.configParameters ?? []).find(
        (param) => param.parameterName === parameterName
      );
      if (parameter) {
        parameter.paramValue = value;
      }
    },
  };
}

// Extract text from PDF file using pdf-parse library
async function extractTextFromPDFFile(
  filePath: string,
  maxPages: number = 50,
  includeMetadata: boolean = true,
  cleanText: boolean = true
) {
  try {
    console.log(`📁 Reading PDF file: ${filePath}`);
    const fileData = await fs.readFile(filePath);

    if (!fileData || fileData.length === 0) {
      throw new Error("File is empty or could not be read");
    }

    // Validate PDF header
    const header = new TextDecoder().decode(fileData.slice(0, 4));
    if (!header.startsWith("%PDF")) {
      throw new Error("File is not a valid PDF - missing PDF header");
    }

    // Parse PDF using pdf-parse
    const pdfData = await pdfParse(fileData);

    let fullText = pdfData.text;
    let metadata = {};

    // Extract metadata if requested
    if (includeMetadata) {
      metadata = {
        title: pdfData.info?.Title || "",
        author: pdfData.info?.Author || "",
        subject: pdfData.info?.Subject || "",
        creator: pdfData.info?.Creator || "",
        producer: pdfData.info?.Producer || "",
        creationDate: pdfData.info?.CreationDate || "",
        modificationDate: pdfData.info?.ModDate || "",
        totalPages: pdfData.numpages,
        pdfVersion: pdfData.version || "",
      };
    }

    console.log(`📄 Extracted text from ${pdfData.numpages} pages...`);

    // Clean the text if requested
    const processedText = cleanText ? cleanExtractedText(fullText) : fullText;

    // Count words
    const wordCount = processedText
      .split(/\s+/)
      .filter((word: string) => word.length > 0).length;

    // Additional statistics
    const characterCount = processedText.length;
    const lineCount = processedText.split("\n").length;

    return {
      text: processedText,
      pageCount: pdfData.numpages,
      wordCount: wordCount,
      characterCount: characterCount,
      lineCount: lineCount,
      metadata: metadata,
      extractionStats: {
        totalPages: pdfData.numpages,
        processedPages: Math.min(pdfData.numpages, maxPages),
        skippedPages: Math.max(0, pdfData.numpages - maxPages),
        fileSize: fileData.length,
      },
    };
  } catch (error) {
    console.error("PDF text extraction failed:", error);
    throw new Error(
      `PDF text extraction failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Clean and normalize extracted text
function cleanExtractedText(text: string): string {
  return (
    text
      // Remove page markers
      .replace(/--- PAGE \d+ ---\n/g, "\n")
      // Fix common PDF extraction issues
      .replace(/([a-z])([A-Z])/g, "$1 $2") // Add space between camelCase
      .replace(/(\.)([A-Z])/g, "$1 $2") // Add space after periods
      .replace(/([a-z])(\d)/g, "$1 $2") // Add space between letters and numbers
      .replace(/(\d)([a-z])/g, "$1 $2") // Add space between numbers and letters
      // Remove excessive whitespace
      .replace(/\s+/g, " ")
      // Remove excessive line breaks
      .replace(/\n{3,}/g, "\n\n")
      // Fix hyphenated words at line breaks
      .replace(/-\s+/g, "")
      // Remove common PDF artifacts
      .replace(/[^\w\s\.\,\!\?\;\:\-\(\)\[\]\{\}\"\']/g, " ")
      // Trim whitespace
      .trim()
  );
}

// Parse page range string (e.g., "1-5,10,15-20")
function parsePageRange(rangeStr: string, maxPages: number): number[] {
  if (!rangeStr.trim()) {
    return Array.from({ length: maxPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  const parts = rangeStr.split(",").map((s) => s.trim());

  for (const part of parts) {
    if (part.includes("-")) {
      const rangeParts = part.split("-").map((s) => parseInt(s.trim()));
      const start = rangeParts[0];
      const end = rangeParts[1];

      if (
        start !== undefined &&
        end !== undefined &&
        !isNaN(start) &&
        !isNaN(end) &&
        start <= end
      ) {
        for (let i = start; i <= Math.min(end, maxPages); i++) {
          pages.add(i);
        }
      }
    } else {
      const page = parseInt(part);
      if (!isNaN(page) && page >= 1 && page <= maxPages) {
        pages.add(page);
      }
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

// Enhanced extraction with page range support
async function extractTextFromPDFFileWithRange(
  filePath: string,
  pageRange: string = "",
  includeMetadata: boolean = true,
  cleanText: boolean = true
) {
  try {
    console.log(`📁 Reading PDF file: ${filePath}`);
    const fileData = await fs.readFile(filePath);

    // Parse PDF using pdf-parse
    const pdfData = await pdfParse(fileData);

    // Note: pdf-parse doesn't support page-specific extraction
    // For now, we extract all text and note the limitation
    let fullText = pdfData.text;
    let metadata = {};

    if (includeMetadata) {
      metadata = {
        title: pdfData.info?.Title || "",
        author: pdfData.info?.Author || "",
        subject: pdfData.info?.Subject || "",
        creator: pdfData.info?.Creator || "",
        producer: pdfData.info?.Producer || "",
        creationDate: pdfData.info?.CreationDate || "",
        modificationDate: pdfData.info?.ModDate || "",
        totalPages: pdfData.numpages,
      };
    }

    console.log(
      `📄 Extracted text from all ${pdfData.numpages} pages (page range feature not supported with pdf-parse)`
    );

    const processedText = cleanText ? cleanExtractedText(fullText) : fullText;
    const wordCount = processedText
      .split(/\s+/)
      .filter((word: string) => word.length > 0).length;

    return {
      text: processedText,
      pageCount: pdfData.numpages,
      wordCount: wordCount,
      metadata: metadata,
      extractedPages: Array.from({ length: pdfData.numpages }, (_, i) => i + 1),
    };
  } catch (error) {
    throw new Error(
      `PDF text extraction failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// Batch process multiple PDFs with progress tracking
async function batchExtractTextFromFiles(
  downloadResults: any[],
  maxPages: number,
  progressCallback?: (progress: number, current: string) => void
) {
  const results = [];
  const successfulDownloads = downloadResults.filter(
    (result) => result.status === "success" && result.filePath
  );

  for (let i = 0; i < successfulDownloads.length; i++) {
    const downloadResult = successfulDownloads[i];

    try {
      if (progressCallback) {
        progressCallback(
          Math.round((i / successfulDownloads.length) * 100),
          downloadResult.title || downloadResult.filename || "Unknown"
        );
      }

      const extractionResult = await extractTextFromPDFFile(
        downloadResult.filePath,
        maxPages,
        true,
        true
      );

      results.push({
        ...downloadResult,
        extractedText: extractionResult.text,
        pageCount: extractionResult.pageCount,
        wordCount: extractionResult.wordCount,
        metadata: extractionResult.metadata,
        extractionStats: extractionResult.extractionStats,
        extractionStatus: "success",
      });
    } catch (error) {
      results.push({
        ...downloadResult,
        extractedText: "",
        pageCount: 0,
        wordCount: 0,
        metadata: {},
        extractionStatus: "failed",
        extractionError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (progressCallback) {
    progressCallback(100, "Complete");
  }

  return results;
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType(
    metadata.nodeType,
    createPDFTextExtractorNode,
    metadata
  );
}

// Export utility functions for external use
export {
  extractTextFromPDFFile,
  extractTextFromPDFFileWithRange,
  batchExtractTextFromFiles,
  cleanExtractedText,
  parsePageRange,
};
