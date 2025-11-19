/*
 * yaLLMa3 - Framework for building AI agents that are capable of learning from their environment and interacting with it.
 *
 * Copyright (C) 2025 yaLLMa3
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at [https://www.mozilla.org/MPL/2.0/](https://www.mozilla.org/MPL/2.0/).
 *
 * This software is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied.
 */

import type {
  BaseNode,
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  NodeMetadata,
  Position,
  DataType,
} from "../types/types";
import { NodeRegistry } from "../NodeRegistry";

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  relevance_score: number;
  source_query: string;
}

interface SearchResultsInput {
  search_results: SearchResult[];
  total_count: number;
}

interface QueryMetadata {
  parsed_query: {
    domain_type: string;
    data_type: string;
    sample_count: number;
    language: string;
    iso_language: string;
    description?: string;
    categories?: string[] | null;
  };
  required_topics: number;
  search_stats?: {
    queries_generated: number;
    total_urls_found: number;
    results_per_query: number;
  };
}

interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  word_count: number;
  success: boolean;
  error?: string;
}

interface ContentChunk {
  chunk_id: string;
  content: string;
  source_url: string;
  chunk_index: number;
  total_chunks: number;
  token_count: number;
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{
      text?: string;
    }>;
  };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: {
    blockReason?: string;
  };
}

export interface ScraperNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "Data",
  title: "Scraper",
  nodeType: "Scraper",
  description: "A multi-stage data processing node that scrapes web pages from search results, chunks the content, and uses the Gemini API to extract relevant topics. It requires both ScraperAPI and Gemini API keys.",
  nodeValue: "",
  sockets: [
    { title: "Search Results", type: "input", dataType: "json" },
    { title: "Query Metadata", type: "input", dataType: "json" },
    { title: "Extracted Topics", type: "output", dataType: "json" },
    { title: "Scraped Data", type: "output", dataType: "json" },
    { title: "Status", type: "output", dataType: "string" },
  ],
  width: 350,
  height: 300,
  configParameters: [
    {
      parameterName: "ScraperAPI Key",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "ScraperAPI key for web scraping",
      isNodeBodyContent: false,
      i18n: {
        en: {
          "ScraperAPI Key": {
            Name: "ScraperAPI Key",
            Description: "ScraperAPI key for web scraping",
          },
        },
        ar: {
          "ScraperAPI Key": {
            Name: "مفتاح ScraperAPI",
            Description: "مفتاح ScraperAPI لكشط الويب",
          },
        },
      },
    },
    {
      parameterName: "Gemini API Key",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Google Gemini API key for topic extraction",
      isNodeBodyContent: false,
      i18n: {
        en: {
          "Gemini API Key": {
            Name: "Gemini API Key",
            Description: "Google Gemini API key for topic extraction",
          },
        },
        ar: {
          "Gemini API Key": {
            Name: "مفتاح Google Gemini API",
            Description: "مفتاح Google Gemini API لاستخراج الموضوعات",
          },
        },
      },
    },
    {
      parameterName: "Gemini Model",
      parameterType: "string",
      defaultValue: "gemini-2.5-flash",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Gemini model for topic extraction",
      isNodeBodyContent: true,
      sourceList: [
        { key: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
        { key: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
        { key: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
      ],
      i18n: {
        en: {
          "Gemini Model": {
            Name: "Gemini Model",
            Description: "Gemini model for topic extraction",
          },
        },
        ar: {
          "Gemini Model": {
            Name: "نموذج Gemini",
            Description: "نموذج Gemini لاستخراج الموضوعات",
          },
        },
      },
    },
    {
      parameterName: "Max Chunk Size",
      parameterType: "number",
      defaultValue: 7000,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Maximum characters per content chunk (for Gemini token limits)",
      isNodeBodyContent: false,
      i18n: {
        en: {
          "Max Chunk Size": {
            Name: "Max Chunk Size",
            Description: "Maximum characters per content chunk (for Gemini token limits)",
          },
        },
        ar: {
          "Max Chunk Size": {
            Name: "الحد الأقصى لحجم الجزء",
            Description: "الحد الأقصى للأحرف لكل جزء محتوى (لحدود رموز Gemini)",
          },
        },
      },
    },
  ],
  i18n: {
    en: {
      category: "Data",
      title: "Scraper",
      nodeType: "Scraper",
      description: "A multi-stage data processing node that scrapes web pages from search results, chunks the content, and uses the Gemini API to extract relevant topics. It requires both ScraperAPI and Gemini API keys.",
    },
    ar: {
      category: "بيانات",
      title: "كاشط الويب",
      nodeType: "كاشط الويب",
      description: "عقدة معالجة بيانات متعددة المراحل تكشط صفحات الويب من نتائج البحث وتقسم المحتوى وتستخدم Gemini API لاستخراج الموضوعات ذات الصلة. يتطلب مفاتيح API لكل من ScraperAPI و Gemini.",
    },
  },
};

function getStringConfig(param: ConfigParameterType | undefined): string {
  if (!param) return "";
  const value = param.paramValue ?? param.defaultValue;
  return typeof value === "string" ? value : String(value);
}
function getNumberConfig(param: ConfigParameterType | undefined): number {
  if (!param) return 0;
  const value = param.paramValue ?? param.defaultValue;
  return typeof value === "number" ? value : Number(value);
}

export function createScraperNode(id: number, position: Position): ScraperNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: metadata.sockets.map((socket, index) => ({
      id: id * 100 + index + 1,
      title: socket.title,
      type: socket.type,
      nodeId: id,
      dataType: socket.dataType as DataType,
    })),
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    selected: false,
    processing: false,
    configParameters: [...metadata.configParameters],

    process: async (context: NodeExecutionContext) => {
      try {
        const searchResultsInput = await context.inputs[id * 100 + 1];
        const queryMetadataInput = await context.inputs[id * 100 + 2];

        if (!searchResultsInput || !queryMetadataInput) {
          throw new Error(
            "Both Search Results and Query Metadata inputs are required"
          );
        }

        console.log(
          `[Scraper Node ${id}] Starting scraping and topic extraction...`
        );

        const searchResultsData: SearchResultsInput =
          typeof searchResultsInput === "string"
            ? JSON.parse(searchResultsInput)
            : searchResultsInput;

        const queryMetadata: QueryMetadata =
          typeof queryMetadataInput === "string"
            ? JSON.parse(queryMetadataInput)
            : queryMetadataInput;

        const searchResults = searchResultsData.search_results || [];

        if (searchResults.length === 0) {
          throw new Error("No search results provided to scrape");
        }
        const scraperApiKey = getStringConfig(
          context.node.configParameters?.find(
            (p) => p.parameterName === "ScraperAPI Key"
          )
        );
        const geminiApiKey = getStringConfig(
          context.node.configParameters?.find(
            (p) => p.parameterName === "Gemini API Key"
          )
        );

        if (!scraperApiKey) {
          throw new Error(
            "ScraperAPI Key is required. Please configure it in node settings."
          );
        }
        if (!geminiApiKey) {
          throw new Error(
            "Gemini API Key is required. Please configure it in node settings."
          );
        }
        const geminiModel =
          getStringConfig(
            context.node.configParameters?.find(
              (p) => p.parameterName === "Gemini Model"
            )
          ) || "gemini-2.5-flash";

        const maxChunkSize =
          getNumberConfig(
            context.node.configParameters?.find(
              (p) => p.parameterName === "Max Chunk Size"
            )
          ) || 7000;

        console.log(
          `[Scraper Node ${id}] Config: Model=${geminiModel}, MaxChunkSize=${maxChunkSize}`
        );

        console.log(
          `[Scraper Node ${id}] Step 1/4: Filtering ${searchResults.length} URLs...`
        );

        const filteredUrls = await filterUrls(searchResults);

        console.log(
          `[Scraper Node ${id}] Filtered to ${filteredUrls.length} valid URLs`
        );

        if (filteredUrls.length === 0) {
          throw new Error("No valid URLs remaining after filtration");
        }

        console.log(
          `[Scraper Node ${id}] Step 2/4: Scraping ${filteredUrls.length} URLs...`
        );

        const scrapedData = await scrapeUrls(filteredUrls, scraperApiKey);

        const successfulScrapes = scrapedData.filter((d) => d.success).length;
        console.log(
          `[Scraper Node ${id}] Successfully scraped ${successfulScrapes}/${scrapedData.length} pages`
        );

        if (successfulScrapes === 0) {
          throw new Error(
            "Failed to scrape any content from the provided URLs"
          );
        }

        console.log(`[Scraper Node ${id}] Step 3/4: Chunking content...`);

        const chunks = chunkContent(scrapedData, maxChunkSize);

        console.log(
          `[Scraper Node ${id}] Created ${chunks.length} content chunks`
        );

        console.log(
          `[Scraper Node ${id}] Step 4/4: Extracting topics from chunks...`
        );

        const extractedTopics = await extractTopics(
          chunks,
          queryMetadata.parsed_query.language,
          queryMetadata.parsed_query.domain_type,
          queryMetadata.required_topics,
          geminiApiKey,
          geminiModel
        );

        console.log(
          `[Scraper Node ${id}] Extracted ${extractedTopics.length} unique topics`
        );

        const topicsOutput = {
          extracted_topics: extractedTopics,
          topics_count: extractedTopics.length,
          required_topics: queryMetadata.required_topics,
          coverage_ratio:
            extractedTopics.length / queryMetadata.required_topics,
        };

        const scrapedDataOutput = {
          scraped_pages: scrapedData.length,
          successful_scrapes: successfulScrapes,
          failed_scrapes: scrapedData.length - successfulScrapes,
          total_chunks: chunks.length,
          scraped_content: scrapedData,
        };

        console.log(
          `[Scraper Node ${id}]  Scraping and extraction completed successfully`
        );

        return {
          [id * 100 + 3]: JSON.stringify(topicsOutput, null, 2),
          [id * 100 + 4]: JSON.stringify(scrapedDataOutput, null, 2),
          [id * 100 +
          5]: `Success: Scraped ${successfulScrapes} pages, extracted ${
            extractedTopics.length
          } topics (${(topicsOutput.coverage_ratio * 100).toFixed(
            1
          )}% coverage)`,
        };
      } catch (error) {
        console.error(`[Scraper Node ${id}] ❌ Error:`, error);

        return {
          [id * 100 + 3]: JSON.stringify(
            {
              extracted_topics: [],
              topics_count: 0,
              required_topics: 0,
              coverage_ratio: 0,
            },
            null,
            2
          ),
          [id * 100 + 4]: JSON.stringify(
            {
              scraped_pages: 0,
              successful_scrapes: 0,
              failed_scrapes: 0,
              total_chunks: 0,
              scraped_content: [],
            },
            null,
            2
          ),
          [id * 100 + 5]: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },

    getConfigParameters(): ConfigParameterType[] {
      return this.configParameters || [];
    },

    getConfigParameter(parameterName: string): ConfigParameterType | undefined {
      return (this.configParameters ?? []).find(
        (param) => param.parameterName === parameterName
      );
    },

    setConfigParameter(
      parameterName: string,
      value: string | number | boolean
    ): void {
      const parameter = (this.configParameters ?? []).find(
        (param) => param.parameterName === parameterName
      );
      if (parameter) {
        parameter.paramValue = value;
      }
    },
  };
}

async function filterUrls(searchResults: SearchResult[]): Promise<string[]> {
  const seenUrls = new Set<string>();
  const validUrls: string[] = [];

  const binaryExtensions = [
    ".pdf",
    ".doc",
    ".docx",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
    ".zip",
    ".rar",
    ".tar",
    ".gz",
    ".7z",
    ".exe",
    ".dmg",
    ".mp4",
    ".avi",
    ".mkv",
    ".mov",
    ".wmv",
    ".flv",
    ".mp3",
    ".wav",
    ".flac",
    ".aac",
    ".ogg",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".svg",
    ".webp",
    ".css",
    ".js",
    ".json",
    ".xml",
    ".rss",
  ];

  const loginPatterns = [
    "/login",
    "/signin",
    "/signup",
    "/register",
    "/auth",
    "login.",
    "signin.",
    "auth.",
    "account.",
  ];

  const excludedDomains = [
    "twitter.com",
    "x.com",
    "facebook.com",
    "instagram.com",
    "tiktok.com",
    "snapchat.com",
    "pinterest.com",
  ];

  for (const result of searchResults) {
    try {
      const url = result.url.toLowerCase();

      if (binaryExtensions.some((ext) => url.endsWith(ext))) {
        console.log(`  [Filter] Skipped binary file: ${result.url}`);
        continue;
      }

      if (loginPatterns.some((pattern) => url.includes(pattern))) {
        console.log(`  [Filter] Skipped login page: ${result.url}`);
        continue;
      }

      if (excludedDomains.some((domain) => url.includes(domain))) {
        console.log(`  [Filter] Skipped social media: ${result.url}`);
        continue;
      }

      const normalizedUrl = url.replace(/\/$/, "");
      if (seenUrls.has(normalizedUrl)) {
        console.log(`  [Filter] Skipped duplicate: ${result.url}`);
        continue;
      }

      seenUrls.add(normalizedUrl);
      validUrls.push(result.url);
    } catch (error) {
      console.warn(`  [Filter] Error processing URL ${result.url}:`, error);
      continue;
    }
  }

  return validUrls;
}

async function scrapeUrls(
  urls: string[],
  apiKey: string
): Promise<ScrapedContent[]> {
  const results: ScrapedContent[] = [];
  const concurrency = 5;
  const batches: string[][] = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    batches.push(urls.slice(i, i + concurrency));
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];

    if (!batch || batch.length === 0) {
      continue;
    }

    console.log(
      `  [Scraper] Processing batch ${batchIndex + 1}/${batches.length} (${
        batch.length
      } URLs)`
    );

    const batchPromises = batch.map((url) => scrapeUrl(url, apiKey));
    const batchResults = await Promise.allSettled(batchPromises);

    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i];
      const currentUrl = batch[i];
      if (!result || !currentUrl || typeof currentUrl !== "string") {
        continue;
      }

      if (result.status === "fulfilled") {
        if (result.value) {
          results.push(result.value);
        }
      } else {
        console.warn(
          `  [Scraper] Failed to scrape ${currentUrl}:`,
          result.reason
        );
        results.push({
          url: currentUrl,
          title: "",
          content: "",
          word_count: 0,
          success: false,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
      }
    }

    if (batchIndex < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return results;
}

async function scrapeUrl(url: string, apiKey: string): Promise<ScrapedContent> {
  const scraperApiUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(
    url
  )}`;

  try {
    const response = await fetch(scraperApiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const textContent = extractTextFromHtml(html);
    const title = extractTitleFromHtml(html);

    return {
      url,
      title,
      content: textContent,
      word_count: textContent.split(/\s+/).length,
      success: true,
    };
  } catch (error) {
    throw new Error(
      `Failed to scrape ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function extractTextFromHtml(html: string): string {
  let text = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

function extractTitleFromHtml(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return titleMatch?.[1]?.trim() ?? "";
}

function chunkContent(
  scrapedData: ScrapedContent[],
  maxChunkSize: number
): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  let chunkIdCounter = 0;

  for (const data of scrapedData) {
    if (!data.success || !data.content || data.content.length === 0) {
      continue;
    }

    const content = data.content;
    const contentLength = content.length;

    if (contentLength <= maxChunkSize) {
      chunks.push({
        chunk_id: `chunk_${String(chunkIdCounter).padStart(4, "0")}`,
        content: content,
        source_url: data.url,
        chunk_index: 0,
        total_chunks: 1,
        token_count: Math.ceil(contentLength / 4),
      });
      chunkIdCounter++;
    } else {
      const totalChunks = Math.ceil(contentLength / maxChunkSize);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * maxChunkSize;
        const end = Math.min(start + maxChunkSize, contentLength);
        const chunkContent = content.substring(start, end);

        chunks.push({
          chunk_id: `chunk_${String(chunkIdCounter).padStart(4, "0")}`,
          content: chunkContent,
          source_url: data.url,
          chunk_index: i,
          total_chunks: totalChunks,
          token_count: Math.ceil(chunkContent.length / 4),
        });
        chunkIdCounter++;
      }
    }
  }

  return chunks;
}
async function extractTopics(
  chunks: ContentChunk[],
  language: string,
  domainType: string,
  requiredTopics: number,
  apiKey: string,
  model: string
): Promise<string[]> {
  const allTopics: string[] = [];
  const seenTopics = new Set<string>();
  const concurrency = 4;
  const batches: ContentChunk[][] = [];
  for (let i = 0; i < chunks.length; i += concurrency) {
    batches.push(chunks.slice(i, i + concurrency));
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    if (allTopics.length >= requiredTopics) {
      console.log(
        `  [Topics] Reached required topic count (${requiredTopics}), stopping extraction`
      );
      break;
    }

    const batch = batches[batchIndex];

    if (!batch || batch.length === 0) {
      continue;
    }

    console.log(
      `  [Topics] Processing batch ${batchIndex + 1}/${batches.length} (${
        batch.length
      } chunks)`
    );

    const batchPromises = batch.map((chunk) => {
      if (!chunk || !chunk.content) {
        return Promise.resolve([]);
      }
      return extractTopicsFromChunk(
        chunk.content,
        language,
        domainType,
        apiKey,
        model
      );
    });

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value) {
        for (const topic of result.value) {
          const topicLower = topic.toLowerCase().trim();
          if (!seenTopics.has(topicLower)) {
            seenTopics.add(topicLower);
            allTopics.push(topic);
          }
        }
      } else if (result.status === "rejected") {
        console.warn(`  [Topics] Chunk extraction failed:`, result.reason);
      }
    }

    if (batchIndex < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  return allTopics;
}

async function extractTopicsFromChunk(
  content: string,
  language: string,
  domainType: string,
  apiKey: string,
  model: string
): Promise<string[]> {
  const systemInstruction = `
  You are an expert content analyst specializing in subtopic extraction for synthetic data generation.
  
  ## Task
  Extract 5-10 focused subtopics from the provided content in ${language} language, ensuring relevance to the ${domainType} domain.
  
  ## Guidelines:
  - Each subtopic should be specific enough to create multiple related examples
  - Focus only on topics clearly present in the content
  - Use ${language} for all subtopic names
  - Keep subtopics relevant to ${domainType}
  - Avoid vague or overly general topics
  
  ## Output Format
  Return a JSON array of subtopic strings:
  ["subtopic 1", "subtopic 2", "subtopic 3"]
  `;

  const prompt = `
  Extract focused subtopics from this content and express them in ${language}, ensuring relevance to the ${domainType} domain:
  
  ${content.substring(0, 3000)} ${content.length > 3000 ? "..." : ""}
  
  Return JSON array with subtopics in ${language}: ["subtopic1", "subtopic2", ...]
  `;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: `System: ${systemInstruction}\n\nUser: ${prompt}` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      console.warn(`  [Topics] Gemini API error: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as GeminiResponse;
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const jsonMatch = generatedText.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return [];
    }

    const topics = JSON.parse(jsonMatch[0]) as unknown[];
    return topics.filter((t): t is string => typeof t === "string");
  } catch (error) {
    console.warn(`  [Topics] Error extracting topics:`, error);
    return [];
  }
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType(metadata.nodeType, createScraperNode, metadata);
}
