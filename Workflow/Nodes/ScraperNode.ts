/*
 * yaLLMa3 - Framework for building AI agents that are capable of learning from their environment and interacting with it.
 *
 * Copyright (C) 2025 yaLLMa3
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at https://www.mozilla.org/MPL/2.0/.
 *
 * This software is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied.
 * See the Mozilla Public License for the specific language governing rights and limitations under the License.
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
import * as cheerio from "cheerio";
import type { CheerioAPI, Element } from "cheerio";


export interface CheerioScraperNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}


interface ScraperResult {
  content: string;
  structured: string;
  metadata: string;
}


interface LinkData {
  text: string;
  href: string;
}


interface ImageData {
  src: string;
  alt: string;
}


interface HeadingData {
  level: string;
  text: string;
}


interface MetadataInfo {
  title: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
  url?: string;
}


const metadata: NodeMetadata = {
  category: "Tools",
  title: "Web Scraper",
  nodeType: "WebScraper",
  description: "Fast web scraper for static HTML content extraction",
  nodeValue: "smart-article",
  sockets: [
    { title: "URL", type: "input", dataType: "string" },
    { title: "Content", type: "output", dataType: "string" },
    { title: "Structured Data", type: "output", dataType: "string" },
    { title: "Metadata", type: "output", dataType: "string" },
  ],
  width: 440,
  height: 280,
  configParameters: [
    {
      parameterName: "Extraction Mode",
      parameterType: "string",
      defaultValue: "smart-article",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "What to extract from the page",
      isNodeBodyContent: true,
      sourceList: [
        { key: "smart-article", label: "📰 Article Content" },
        { key: "metadata", label: "📋 Page Metadata" },
        { key: "all-text", label: "📄 All Text" },
        { key: "headings", label: "📑 Headings (H1-H6)" },
        { key: "links", label: "🔗 All Links" },
        { key: "images", label: "🖼️ All Images" },
        { key: "tables", label: "📊 Tables as JSON" },
        { key: "json-ld", label: "🔧 Schema.org JSON-LD" },
      ],
      i18n: {
        en: {
          "Extraction Mode": {
            Name: "Extraction Mode",
            Description: "What to extract",
          },
        },
        ar: {
          "Extraction Mode": {
            Name: "نوع الاستخراج",
            Description: "ماذا تستخرج",
          },
        },
      },
    },
    {
      parameterName: "Clean Text",
      parameterType: "boolean",
      defaultValue: true,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Remove extra whitespace and clean formatting",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Convert URLs",
      parameterType: "boolean",
      defaultValue: true,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Convert relative URLs to absolute",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Max Items",
      parameterType: "number",
      defaultValue: 100,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Maximum items to extract (for links, images, etc.)",
      isNodeBodyContent: false,
    },
  ],
  i18n: {
    en: {
      category: "Tools",
      title: "Web Scraper",
      nodeType: "Web Scraper",
      description: "Fast scraper for static HTML content.",
    },
    ar: {
      category: "أدوات",
      title: "مستخرج ويب",
      nodeType: "مستخرج ويب",
      description: "مستخرج سريع لمحتوى HTML الثابت.",
    },
  },
};


// ==================== HELPER FUNCTIONS ====================


function cleanText(text: string, shouldClean: boolean): string {
  if (!shouldClean) return text;
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}


function makeAbsoluteUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

import * as dns from "dns/promises";

function isPrivateIP(ip: string): boolean {
  if (ip.startsWith("fe80:") || ip.startsWith("::ffff:")) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip === "::1" || ip === "::") return true;
  if (ip.startsWith("0.0.0.0")) return true;

  const parts = ip.split(".");
  if (parts.length === 4) {
    const p0 = parseInt(parts[0] ?? "", 10);
    const p1 = parseInt(parts[1] ?? "", 10);
    const p2 = parseInt(parts[2] ?? "", 10);
    const p3 = parseInt(parts[3] ?? "", 10);

    if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2) && !isNaN(p3)) {
      const num = p0 * 16777216 + p1 * 65536 + p2 * 256 + p3;

      return (
        ip.startsWith("127.") ||
        ip.startsWith("10.") ||
        ip.startsWith("192.168.") ||
        ip.startsWith("169.254.") ||
        (num >= 0xAC100000 && num <= 0xAC1FFFFF)
      );
    }
  }

  return false;
}

async function resolveAndValidateIP(hostname: string): Promise<void> {
  try {
    const addresses = await dns.resolve4(hostname);
    for (const ip of addresses) {
      if (isPrivateIP(ip)) {
        throw new Error(`Resolved to private IP: ${ip}`);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("private IP")) {
      throw error;
    }
    try {
      const addresses = await dns.resolve6(hostname);
      for (const ip of addresses) {
        if (isPrivateIP(ip)) {
          throw new Error(`Resolved to private IP: ${ip}`);
        }
      }
    } catch {
      // IPv4 resolution succeeded, or both failed - let fetch handle it
    }
  }
}

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "0.0.0.0" ||
    h === "169.254.169.254" ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h) ||
    /^fc00:/i.test(h) ||
    /^fd/i.test(h) ||
    /^fe80:/i.test(h) ||
    /^::ffff:(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|127\.)/.test(h)
  );
}

function isSafeUrl(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl);
    return !isPrivateHostname(hostname);
  } catch {
    return false;
  }
}


function extractArticleContent($: CheerioAPI): string {
  const selectors = [
    'article',
    '[role="main"]',
    'main',
    '.article-content',
    '.post-content',
    '.entry-content',
    '.content',
    '#content',
  ];

  for (const selector of selectors) {
    const text = $(selector).first().text();
    if (text && text.length > 100) {
      return text;
    }
  }
  return $('body').text();
}


function extractMetadata($: CheerioAPI): MetadataInfo {
  const metadata: MetadataInfo = {
    title: $('title').text(),
    description: $('meta[name="description"]').attr('content') || '',
    ogTitle: $('meta[property="og:title"]').attr('content') || '',
    ogDescription: $('meta[property="og:description"]').attr('content') || '',
    ogImage: $('meta[property="og:image"]').attr('content') || '',
    canonical: $('link[rel="canonical"]').attr('href') || '',
  };

  return metadata;
}


function extractLinks(
  $: CheerioAPI,
  baseUrl: string,
  convertUrls: boolean,
  maxItems: number
): LinkData[] {
  const links: LinkData[] = [];

  $('a[href]').each((_index: number, el: Element) => {
    if (links.length >= maxItems) return false;
    let href = $(el).attr('href') || '';
    if (convertUrls) href = makeAbsoluteUrl(href, baseUrl);
    links.push({
      text: $(el).text().trim(),
      href: href,
    });
  });

  return links;
}


function extractImages(
  $: CheerioAPI,
  baseUrl: string,
  convertUrls: boolean,
  maxItems: number
): ImageData[] {
  const images: ImageData[] = [];

  $('img[src]').each((_index: number, el: Element) => {
    if (images.length >= maxItems) return false;
    let src = $(el).attr('src') || '';
    if (convertUrls) src = makeAbsoluteUrl(src, baseUrl);
    images.push({
      src: src,
      alt: $(el).attr('alt') || '',
    });
  });

  return images;
}


function extractHeadings($: CheerioAPI): HeadingData[] {
  const headings: HeadingData[] = [];

  $('h1, h2, h3, h4, h5, h6').each((_index: number, el: Element) => {
    headings.push({
      level: el.tagName.toLowerCase(),
      text: $(el).text().trim(),
    });
  });

  return headings;
}


function extractTables($: CheerioAPI): string[][][] {
  const tables: string[][][] = [];

  $('table').each((_index: number, table: Element) => {
    const tableData: string[][] = [];
    $(table).find('tr').each((_rowIndex: number, row: Element) => {
      const rowData: string[] = [];
      $(row).find('th, td').each((_cellIndex: number, cell: Element) => {
        rowData.push($(cell).text().trim());
      });
      if (rowData.length > 0) tableData.push(rowData);
    });
    if (tableData.length > 0) tables.push(tableData);
  });

  return tables;
}


function extractJsonLd($: CheerioAPI): unknown[] {
  const jsonLdData: unknown[] = [];

  $('script[type="application/ld+json"]').each((_index: number, el: Element) => {
    try {
      const data = JSON.parse($(el).html() || '{}');
      jsonLdData.push(data);
    } catch {
      // Invalid JSON, skip
    }
  });

  return jsonLdData;
}


// ==================== HTTP FETCHING ====================


async function fetchHtml(url: string): Promise<string> {
  const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB limit
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const { hostname } = new URL(url);
    await resolveAndValidateIP(hostname);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      throw new Error(`Response too large: ${contentLength} bytes (max ${MAX_BODY_BYTES})`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        reader.cancel();
        throw new Error(`Response exceeded ${MAX_BODY_BYTES} byte limit`);
      }
      chunks.push(value);
    }

    const html = new TextDecoder().decode(Buffer.concat(chunks));
    return html;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout after 30 seconds');
      }
      throw error;
    }
    throw new Error('Unknown error occurred while fetching URL');
  }
}


// ==================== MAIN NODE ====================


export function createCheerioScraperNode(id: number, position: Position): CheerioScraperNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: [
      { id: id * 100 + 1, title: "URL", type: "input", nodeId: id, dataType: "string" },
      { id: id * 100 + 3, title: "Content", type: "output", nodeId: id, dataType: "string" },
      { id: id * 100 + 4, title: "Structured Data", type: "output", nodeId: id, dataType: "string" },
      { id: id * 100 + 5, title: "Metadata", type: "output", nodeId: id, dataType: "string" },
    ],
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    selected: false,
    processing: false,
    process: async (context: NodeExecutionContext) => {
      const n = context.node as CheerioScraperNode;

      // Get inputs
      const urlInput = await context.inputs[n.id * 100 + 1];
      const url = String(urlInput || "").trim();

      // Validate URL
      if (!url) {
        return {
          [n.id * 100 + 3]: "Error: No URL provided",
          [n.id * 100 + 4]: "",
          [n.id * 100 + 5]: "",
        };
      }

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return {
          [n.id * 100 + 3]: "Error: URL must start with http:// or https://",
          [n.id * 100 + 4]: "",
          [n.id * 100 + 5]: "",
        };
      }

      if (!isSafeUrl(url)) {
        return {
          [n.id * 100 + 3]: "Error: URL host is not allowed",
          [n.id * 100 + 4]: "",
          [n.id * 100 + 5]: "",
        };
      }

      // Get configuration
      const getConfigParam = n.getConfigParameter?.bind(n);
      if (!getConfigParam) {
        return {
          [n.id * 100 + 3]: "Error: Configuration parameters not available",
          [n.id * 100 + 4]: "",
          [n.id * 100 + 5]: "",
        };
      }

      const extractionMode = (getConfigParam("Extraction Mode")?.paramValue as string) || "smart-article";
      const cleanTextOption = (getConfigParam("Clean Text")?.paramValue as boolean) !== false;
      const convertUrls = (getConfigParam("Convert URLs")?.paramValue as boolean) !== false;
      const maxItems = (getConfigParam("Max Items")?.paramValue as number) || 100;

      console.log(`🌐 Cheerio Scraper Node ${n.id}: Scraping ${url}`);
      console.log(`📋 Extraction mode: ${extractionMode}`);

      // Storage for results
      const result: ScraperResult = {
        content: "",
        structured: "",
        metadata: "",
      };

      try {
        // Fetch HTML
        console.log(`🔍 Fetching HTML from: ${url}`);
        const html = await fetchHtml(url);
        console.log(`✅ HTML fetched successfully (${html.length} bytes)`);

        // Load HTML into Cheerio
        const $ = cheerio.load(html);

        // Process based on extraction mode
        switch (extractionMode) {
          case "smart-article": {
            result.content = cleanText(extractArticleContent($), cleanTextOption);
            break;
          }

          case "metadata": {
            const meta = extractMetadata($);
            result.metadata = JSON.stringify(meta, null, 2);
            result.content = JSON.stringify(meta);
            break;
          }

          case "all-text": {
            result.content = cleanText($('body').text(), cleanTextOption);
            break;
          }

          case "headings": {
            const headings = extractHeadings($);
            result.structured = JSON.stringify(headings, null, 2);
            result.content = headings.map(h => `${h.level.toUpperCase()}: ${h.text}`).join('\n');
            break;
          }

          case "links": {
            const links = extractLinks($, url, convertUrls, maxItems);
            result.structured = JSON.stringify(links, null, 2);
            result.content = `Found ${links.length} links`;
            break;
          }

          case "images": {
            const images = extractImages($, url, convertUrls, maxItems);
            result.structured = JSON.stringify(images, null, 2);
            result.content = `Found ${images.length} images`;
            break;
          }

          case "tables": {
            const tables = extractTables($);
            result.structured = JSON.stringify(tables, null, 2);
            result.content = `Found ${tables.length} tables`;
            break;
          }

          case "json-ld": {
            const jsonLd = extractJsonLd($);
            result.structured = JSON.stringify(jsonLd, null, 2);
            result.content = `Found ${jsonLd.length} JSON-LD schemas`;
            break;
          }

          default: {
            result.content = cleanText($('body').text(), cleanTextOption);
            break;
          }
        }

        // Always extract basic metadata
        if (extractionMode !== "metadata") {
          const basicMeta: MetadataInfo = {
            title: $('title').text(),
            url: url,
          };
          result.metadata = JSON.stringify(basicMeta, null, 2);
        }

        // Check if we got results
        if (!result.content && !result.structured && !result.metadata) {
          return {
            [n.id * 100 + 3]: "Error: No content was extracted from the URL",
            [n.id * 100 + 4]: "",
            [n.id * 100 + 5]: "",
          };
        }

        console.log(`✅ Scraper Node ${n.id}: Success`);

        return {
          [n.id * 100 + 3]: result.content,
          [n.id * 100 + 4]: result.structured,
          [n.id * 100 + 5]: result.metadata,
        };

      } catch (error) {
        console.error(`❌ Error in Scraper node ${n.id}:`, error);
        const errorMsg = error instanceof Error ? error.message : String(error);

        return {
          [n.id * 100 + 3]: `Error: ${errorMsg}`,
          [n.id * 100 + 4]: "",
          [n.id * 100 + 5]: "",
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


export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType("WebScraper", createCheerioScraperNode, metadata);
}