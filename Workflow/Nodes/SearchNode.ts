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

interface TavilySearchResult {
  url: string;
  title: string;
  content: string;
  score: number;
  raw_content?: string;
}

interface TavilyResponse {
  results: TavilySearchResult[];
  answer?: string;
  query?: string;
  response_time?: number;
}

interface ParsedQueryResult {
  query_type: "data_generation" | "incomplete" | "not_data_generation";
  domain_type?: string;
  data_type?: string;
  sample_count?: number;
  language?: string;
  iso_language?: string;
  description?: string;
  categories?: string[] | null;
}

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  relevance_score: number;
source_query?: string;
}

export interface SearchNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "Data Generation",
  title: "Search",
  nodeType: "Search",
  nodeValue: null,
  sockets: [
    { title: "User Query", type: "input", dataType: "string" },
    { title: "Search Results", type: "output", dataType: "json" },
    { title: "Query Metadata", type: "output", dataType: "json" },
    { title: "Status", type: "output", dataType: "string" },
  ],
  width: 350,
  height: 280,
  configParameters: [
    {
      parameterName: "Gemini API Key",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Google Gemini API key for query analysis and refinement",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Tavily API Key",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Tavily API key for web search execution",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Gemini Model",
      parameterType: "string",
      defaultValue: "gemini-2.5-flash",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Gemini model for query processing",
      isNodeBodyContent: true,
      sourceList: [
        { key: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
        { key: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
        { key: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
      ],
    },
    {
      parameterName: "Number of Search Queries",
      parameterType: "number",
      defaultValue: 30,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "How many refined search queries to generate",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Results Per Query",
      parameterType: "number",
      defaultValue: 5,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Number of search results per query",
      isNodeBodyContent: false,
    },
  ],
};

export function createSearchNode(id: number, position: Position): SearchNode {
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
        const userQuery = await context.inputs[id * 100 + 1];
        
        if (!userQuery || typeof userQuery !== "string" || userQuery.trim().length === 0) {
          throw new Error("User query is required and must be a non-empty string");
        }

        console.log(`[Search Node ${id}] Processing query: "${userQuery}"`);

        const geminiKeyParam = context.node.configParameters?.find(
          (param) => param.parameterName === "Gemini API Key"
        );
        const geminiApiKey = (geminiKeyParam?.paramValue as string) || "";

        const tavilyKeyParam = context.node.configParameters?.find(
          (param) => param.parameterName === "Tavily API Key"
        );
        const tavilyApiKey = (tavilyKeyParam?.paramValue as string) || "";

        if (!geminiApiKey) {
          throw new Error("Gemini API Key is required. Please configure it in node settings.");
        }
        if (!tavilyApiKey) {
          throw new Error("Tavily API Key is required. Please configure it in node settings.");
        }

        const modelParam = context.node.configParameters?.find(
          (param) => param.parameterName === "Gemini Model"
        );
        const geminiModel = (modelParam?.paramValue as string) || (modelParam?.defaultValue as string);

        const queryCountParam = context.node.configParameters?.find(
          (param) => param.parameterName === "Number of Search Queries"
        );
        const numQueries = (queryCountParam?.paramValue as number) || (queryCountParam?.defaultValue as number);

        const resultsPerQueryParam = context.node.configParameters?.find(
          (param) => param.parameterName === "Results Per Query"
        );
        const resultsPerQuery = (resultsPerQueryParam?.paramValue as number) || (resultsPerQueryParam?.defaultValue as number);

        console.log(`[Search Node ${id}] Config: Model=${geminiModel}, Queries=${numQueries}, ResultsPerQuery=${resultsPerQuery}`);

        console.log(`[Search Node ${id}] Step 1/3: Parsing user query with Gemini...`);
        
        const parsedQuery = await parseUserQuery(userQuery, geminiApiKey, geminiModel);
        
        if (parsedQuery.query_type === "not_data_generation") {
          throw new Error("This query is not related to data generation. Please provide a data generation request.");
        }
        
        if (parsedQuery.query_type === "incomplete") {
          throw new Error("Your request is incomplete. Please specify: number of rows, language, data description, and data type.");
        }

        console.log(`[Search Node ${id}] Parsed query:`, JSON.stringify(parsedQuery, null, 2));

        const requiredTopics = Math.ceil((parsedQuery.sample_count || 0) / 5);

        console.log(`[Search Node ${id}] Step 2/3: Generating ${numQueries} refined search queries...`);
        
        const refinedQueries = await refineQueries(
          parsedQuery.domain_type || "general",
          parsedQuery.language || "English",
          numQueries,
          parsedQuery.categories || null,
          geminiApiKey,
          geminiModel
        );

        console.log(`[Search Node ${id}] Generated ${refinedQueries.length} refined queries`);
        console.log(`[Search Node ${id}] Step 3/3: Executing web search via Tavily...`);
        
        const searchResults = await executeWebSearch(
          refinedQueries,
          tavilyApiKey,
          resultsPerQuery
        );

        console.log(`[Search Node ${id}] Collected ${searchResults.length} total URLs`);

        const outputMetadata = {
          parsed_query: {
            domain_type: parsedQuery.domain_type,
            data_type: parsedQuery.data_type,
            sample_count: parsedQuery.sample_count,
            language: parsedQuery.language,
            iso_language: parsedQuery.iso_language,
            description: parsedQuery.description,
            categories: parsedQuery.categories,
          },
          required_topics: requiredTopics,
          search_stats: {
            queries_generated: refinedQueries.length,
            total_urls_found: searchResults.length,
            results_per_query: resultsPerQuery,
          },
        };

        const outputSearchResults = {
          search_results: searchResults,
          total_count: searchResults.length,
        };

        console.log(`[Search Node ${id}]  Search completed successfully`);

        return {
          [id * 100 + 2]: JSON.stringify(outputSearchResults, null, 2), 
          [id * 100 + 3]: JSON.stringify(outputMetadata, null, 2),      
          [id * 100 + 4]: `Success: Generated ${refinedQueries.length} queries, found ${searchResults.length} URLs for ${parsedQuery.data_type} data in ${parsedQuery.language}`,
        };

      } catch (error) {
        console.error(`[Search Node ${id}]  Error:`, error);

        return {
          [id * 100 + 2]: JSON.stringify({ search_results: [], total_count: 0 }, null, 2),
          [id * 100 + 3]: JSON.stringify({ error: true }, null, 2),
          [id * 100 + 4]: `Error: ${error instanceof Error ? error.message : String(error)}`,
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

    setConfigParameter(parameterName: string, value: string | number | boolean): void {
      const parameter = (this.configParameters ?? []).find(
        (param) => param.parameterName === parameterName
      );
      if (parameter) {
        parameter.paramValue = value;
      }
    },
  };
}

async function parseUserQuery(
  userQuery: string,
  apiKey: string,
  model: string
): Promise<ParsedQueryResult> {
  const systemInstruction = `
You are a specialized query classifier and parameter extractor for a data generation pipeline.

## Core Function
Analyze incoming user queries and classify them into one of three categories, extracting relevant parameters when applicable. Return only a single, valid JSON object with no additional text.

## Analysis Framework

### Step 1: Intent Classification
Determine the user's primary intent by evaluating:

**Data Generation Requests** - Look for:
- Explicit requests for data creation/generation
- Mentions of datasets, samples, examples, or data points
- Specifications of data types (e.g., "generate classification data", "create QA pairs")
- Keywords: generate, create, produce, build, make + data/dataset/samples/examples

**Non-Data Generation Requests** - Include:
- Greetings, casual conversation, or meta-questions
- Requests for explanations, help, or general information
- Questions about the system itself
- Any request not related to data generation

### Step 2: Completeness Assessment
For data generation requests, verify ALL required parameters are present:

**Required Parameters:**
- **Sample Count**: Explicit numeric value (e.g., "100 samples", "50 examples", "1000 rows")
- **Data Description**: Clear indication of what type of data is needed
- **Data Type**: Format or structure specification
- **Language**: Target language for generation

**Optional Parameters:**
- **Domain**: Specific field or industry context
- **Categories**: User-defined categories within the domain

## Response Format Specifications

### Case 1: Non-Data Generation
{"query_type": "not_data_generation"}

### Case 2: Incomplete Data Generation Request
{"query_type": "incomplete"}

### Case 3: Complete Data Generation Request
{
  "query_type": "data_generation",
  "domain_type": "string - specific domain/industry context or 'general' if unspecified",
  "data_type": "string",
  "sample_count": integer - exact number requested (never estimate or default),
  "language": "string - full language name (e.g., English, Arabic, German)",
  "iso_language": "string - ISO 639-1 code (e.g., en, ar). For dialects use base code",
  "description": "string - comprehensive summary of requirements and constraints",
  "categories": "array of strings or null"
}

## Critical Guidelines
1. Return ONLY valid JSON. No explanations or additional text.
2. Never guess sample_count. If missing, classify as "incomplete".
3. Extract domain_type from context or use "general".
4. Capture ALL requirements in description field.
`;

  const prompt = `
Analyze this user query: "${userQuery}"

Now, analyze the user query and return the appropriate JSON object.
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `System: ${systemInstruction}\n\nUser: ${prompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${errorText}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to extract JSON from Gemini response");
  }

  return JSON.parse(jsonMatch[0]) as ParsedQueryResult;
}

async function refineQueries(
  domainType: string,
  language: string,
  count: number,
  categories: string[] | null,
  apiKey: string,
  model: string
): Promise<string[]> {
  const categoryInstruction = categories
    ? `The user has specified the following categories within the ${domainType} domain: ${categories.join(", ")}
- Prioritize generating queries that cover these specific categories
- Ensure queries are distributed across all provided categories`
    : `Cover the entire ${domainType} domain comprehensively since no specific categories were provided.`;

  const systemInstruction = `
You are an expert query generator specializing in creating diverse, high-quality search queries for synthetic data generation pipelines.

## Task Overview
Generate ${count} strategically diverse search queries for the "${domainType}" domain in ${language} language.

${categoryInstruction}

### Requirements:
- Each query should target a distinct aspect of the domain
- Avoid overly generic or vague questions
- Include specific terminology, methods, tools, or concepts when relevant
- Balance theoretical knowledge with practical applications

## Output Format
- Return exactly ${count} queries
- One query per line
- No numbering, bullet points, or additional formatting
- All queries must be grammatically correct in ${language}
`;

  const prompt = `
Generate ${count} diverse and professional search queries in ${language} for the "${domainType}" domain.

Requirements:
- Each query should be 2-10 words long and use domain-specific terminology
- Queries must cover different aspects, subtopics, and specializations within the domain
- Use professional vocabulary that experts in this field would search for
- All queries must be in ${language}
- Focus on practical, actionable, and research-oriented terms
- Each query should be distinct and non-redundant

Generate ${count} search queries for "${domainType}" domain in ${language}:
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `System: ${systemInstruction}\n\nUser: ${prompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error during query refinement: ${errorText}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  const queries: string[] = [];
  for (const line of generatedText.split("\n")) {
    const cleanLine = line
      .trim()
      .replace(/^[-•*]\s*/, "")
      .replace(/^\d+\.\s*/, "")
      .trim();
    if (cleanLine && cleanLine.length > 3) {
      queries.push(cleanLine);
    }
  }

  if (queries.length < count) {
    const fallback = `${domainType} information`;
    queries.push(...Array(count - queries.length).fill(fallback));
  }

  return queries.slice(0, count);
}

async function executeWebSearch(
  queries: string[],
  apiKey: string,
  resultsPerQuery: number
): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];
  const baseUrl = "https://api.tavily.com/search";

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    
    try {
      console.log(`  [Tavily] Searching (${i + 1}/${queries.length}): "${query}"`);

      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: query,
          search_depth: "advanced",
          include_answer: false,
          include_raw_content: false,
          max_results: resultsPerQuery,
          include_domains: [],
          exclude_domains: [],
        }),
      });

      if (response.status === 402 || response.status === 432) {
        console.warn(`  [Tavily]  Quota exhausted at query ${i + 1}. Stopping search.`);
        break;
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (errorText.toLowerCase().includes("quota") || errorText.toLowerCase().includes("credit")) {
          console.warn(`  [Tavily]  Quota exhausted. Stopping search.`);
          break;
        }
        console.warn(`  [Tavily] Search failed for query "${query}": ${errorText}`);
        continue;
      }

      const data = (await response.json()) as TavilyResponse;
      const results = data.results || [];

      for (const result of results) {
        allResults.push({
          url: result.url || "",
          title: result.title || "",
          snippet: result.content || "",
          relevance_score: result.score || 0.0,
          source_query: query,
        });
      }

      if (i < queries.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

    } catch (error) {
      console.warn(`  [Tavily] Error searching "${query}":`, error);
      continue;
    }
  }

  if (allResults.length === 0) {
    throw new Error("No search results could be collected from any query");
  }

  return allResults;
}

export function register(nodeRegistry: NodeRegistry): void {
  console.log(`Registering ${metadata.title} Node under category: ${metadata.category}`);
  nodeRegistry.registerNodeType(metadata.nodeType, createSearchNode, metadata);
}
