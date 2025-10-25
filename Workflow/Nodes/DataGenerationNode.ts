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

interface TopicsInput {
  extracted_topics: string[];
  topics_count: number;
  required_topics: number;
  coverage_ratio: number;
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

interface SyntheticDataPoint {
  [key: string]: any;
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

export interface DataGenerationNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "Data Generation",
  title: "Data Generation",
  nodeType: "DataGeneration",
  nodeValue: null,
  sockets: [
    { title: "Extracted Topics", type: "input", dataType: "json" },
    { title: "Query Metadata", type: "input", dataType: "json" },
    { title: "Synthetic Dataset", type: "output", dataType: "json" },
    { title: "Statistics", type: "output", dataType: "json" },
    { title: "Status", type: "output", dataType: "string" },
  ],
  width: 350,
  height: 300,
  configParameters: [
    {
      parameterName: "Gemini API Key",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Google Gemini API key for synthetic data generation",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Gemini Model",
      parameterType: "string",
      defaultValue: "gemini-2.5-flash",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Gemini model for data generation",
      isNodeBodyContent: true,
      sourceList: [
        { key: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
        { key: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
        { key: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
      ],
    },
    {
      parameterName: "Parallel Agents",
      parameterType: "number",
      defaultValue: 3,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Number of concurrent generation agents (1-5)",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Rows Per Topic",
      parameterType: "number",
      defaultValue: 5,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Data points generated per topic",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Rate Limit Delay (seconds)",
      parameterType: "number",
      defaultValue: 3,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Delay between API requests (free tier: 3s for 5 RPM)",
      isNodeBodyContent: false,
    },
  ],
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

export function createDataGenerationNode(
  id: number,
  position: Position
): DataGenerationNode {
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
      const startTime = Date.now();

      try {
        const topicsInput = await context.inputs[id * 100 + 1];
        const queryMetadataInput = await context.inputs[id * 100 + 2];

        if (!topicsInput || !queryMetadataInput) {
          throw new Error(
            "Both Extracted Topics and Query Metadata inputs are required"
          );
        }

        console.log(
          `[Data Generation Node ${id}] Starting synthetic data generation...`
        );

        const topicsData: TopicsInput =
          typeof topicsInput === "string"
            ? JSON.parse(topicsInput)
            : topicsInput;

        const queryMetadata: QueryMetadata =
          typeof queryMetadataInput === "string"
            ? JSON.parse(queryMetadataInput)
            : queryMetadataInput;

        const topics = topicsData.extracted_topics || [];

        if (topics.length === 0) {
          throw new Error("No topics provided for data generation");
        }

        const geminiApiKey = getStringConfig(
          context.node.configParameters?.find(
            (p) => p.parameterName === "Gemini API Key"
          )
        );

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

        const parallelAgents =
          getNumberConfig(
            context.node.configParameters?.find(
              (p) => p.parameterName === "Parallel Agents"
            )
          ) || 3;

        const rowsPerTopic =
          getNumberConfig(
            context.node.configParameters?.find(
              (p) => p.parameterName === "Rows Per Topic"
            )
          ) || 5;

        const rateLimitDelay =
          getNumberConfig(
            context.node.configParameters?.find(
              (p) => p.parameterName === "Rate Limit Delay (seconds)"
            )
          ) || 3;

        console.log(
          `[Data Generation Node ${id}] Config: Model=${geminiModel}, ParallelAgents=${parallelAgents}, RowsPerTopic=${rowsPerTopic}`
        );

        console.log(
          `[Data Generation Node ${id}] Distributing ${topics.length} topics across ${parallelAgents} agents...`
        );

        const topicBatches: string[][] = [];
        for (let i = 0; i < parallelAgents; i++) {
          topicBatches.push([]);
        }
        topics.forEach((topic, index) => {
          topicBatches[index % parallelAgents]?.push(topic);
        });
        console.log(
          `[Data Generation Node ${id}] Agent distribution:`,
          topicBatches.map(
            (batch, i) => `Agent ${i + 1}: ${batch.length} topics`
          )
        );
        console.log(
          `[Data Generation Node ${id}] Starting parallel data generation...`
        );

        const generationPromises = topicBatches.map((batch, agentIndex) =>
          generateDataForTopics(
            batch,
            agentIndex + 1,
            queryMetadata.parsed_query.data_type,
            queryMetadata.parsed_query.language,
            queryMetadata.parsed_query.description,
            rowsPerTopic,
            geminiApiKey,
            geminiModel,
            rateLimitDelay
          )
        );

        const agentResults = await Promise.allSettled(generationPromises);

        const allData: SyntheticDataPoint[] = [];
        let successfulTopics = 0;
        let failedTopics = 0;

        for (let i = 0; i < agentResults.length; i++) {
          const result = agentResults[i];

          if (!result) {
            failedTopics += topicBatches[i]?.length || 0;
            continue;
          }
          if (result.status === "fulfilled") {
            if (result.value) {
              allData.push(...result.value.data);
              successfulTopics += result.value.successful;
              failedTopics += result.value.failed;
            }
          } else {
            console.warn(
              `[Data Generation Node ${id}] Agent ${i + 1} failed:`,
              result.reason
            );
            failedTopics += topicBatches[i]?.length || 0;
          }
        }

        const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(
          `[Data Generation Node ${id}] ✅ Generation completed in ${executionTime}s`
        );
        console.log(
          `[Data Generation Node ${id}] Generated ${allData.length} data points from ${successfulTopics} topics`
        );
        const statistics = {
          total_generated: allData.length,
          requested_count: queryMetadata.parsed_query.sample_count,
          topics_processed: successfulTopics,
          topics_failed: failedTopics,
          success_rate:
            topics.length > 0
              ? ((successfulTopics / topics.length) * 100).toFixed(1)
              : "0.0",
          generation_time_seconds: parseFloat(executionTime),
          rows_per_topic: rowsPerTopic,
          parallel_agents: parallelAgents,
        };

        const datasetOutput = {
          dataset: allData,
          metadata: {
            domain_type: queryMetadata.parsed_query.domain_type,
            data_type: queryMetadata.parsed_query.data_type,
            language: queryMetadata.parsed_query.language,
            iso_language: queryMetadata.parsed_query.iso_language,
            total_rows: allData.length,
            generation_date: new Date().toISOString(),
          },
        };

        return {
          [id * 100 + 3]: JSON.stringify(datasetOutput, null, 2),
          [id * 100 + 4]: JSON.stringify(statistics, null, 2),
          [id * 100 +
          5]: `Success: Generated ${allData.length} data points from ${successfulTopics}/${topics.length} topics (${statistics.success_rate}% success rate) in ${executionTime}s`,
        };
      } catch (error) {
        console.error(`[Data Generation Node ${id}] ❌ Error:`, error);

        const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);

        return {
          [id * 100 + 3]: JSON.stringify(
            { dataset: [], metadata: {} },
            null,
            2
          ),
          [id * 100 + 4]: JSON.stringify(
            {
              total_generated: 0,
              topics_processed: 0,
              topics_failed: 0,
              success_rate: "0.0",
              generation_time_seconds: parseFloat(executionTime),
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

async function generateDataForTopics(
  topics: string[],
  agentIndex: number,
  dataType: string,
  language: string,
  description: string | undefined,
  rowsPerTopic: number,
  apiKey: string,
  model: string,
  rateLimitDelay: number
): Promise<{ data: SyntheticDataPoint[]; successful: number; failed: number }> {
  console.log(
    `  [Agent ${agentIndex}] Starting generation for ${topics.length} topics`
  );

  const allData: SyntheticDataPoint[] = [];
  let successful = 0;
  let failed = 0;

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];

    if (!topic || typeof topic !== "string") {
      console.warn(
        `  [Agent ${agentIndex}] Skipping invalid topic at index ${i}`
      );
      failed++;
      continue;
    }

    try {
      console.log(
        `  [Agent ${agentIndex}] Generating data (${i + 1}/${
          topics.length
        }): "${topic}"`
      );

      const generatedItems = await generateSyntheticData(
        topic,
        dataType,
        language,
        description,
        rowsPerTopic,
        apiKey,
        model
      );

      if (generatedItems && generatedItems.length > 0) {
        allData.push(...generatedItems);
        successful++;
        console.log(
          `  [Agent ${agentIndex}] ✓ Generated ${generatedItems.length} items for "${topic}"`
        );
      } else {
        failed++;
        console.warn(
          `  [Agent ${agentIndex}] ✗ No data generated for "${topic}"`
        );
      }

      if (i < topics.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, rateLimitDelay * 1000)
        );
      }
    } catch (error) {
      failed++;
      console.error(
        `  [Agent ${agentIndex}] ✗ Error generating data for "${topic}":`,
        error
      );

      const errorMessage =
        error instanceof Error ? error.message.toLowerCase() : "";
      if (
        errorMessage.includes("quota") ||
        errorMessage.includes("rate limit") ||
        errorMessage.includes("exhausted")
      ) {
        console.error(
          `  [Agent ${agentIndex}] 🛑 API quota exhausted. Stopping generation.`
        );
        break;
      }
    }
  }

  console.log(
    `  [Agent ${agentIndex}] Finished: ${successful} successful, ${failed} failed, ${allData.length} total data points`
  );

  return { data: allData, successful, failed };
}

async function generateSyntheticData(
  topic: string,
  dataType: string,
  language: string,
  description: string | undefined,
  rowsPerTopic: number,
  apiKey: string,
  model: string
): Promise<SyntheticDataPoint[]> {
  const descriptionPrompt = description
    ? `
The user has provided this description for the desired output:
---
${description}
---
The output format should be inspired by this description.
`
    : "";

  const systemInstruction = `
You are a synthetic data generation expert. Your task is to generate a list of JSON objects based on a given topic, data type, and language.

Generate ${rowsPerTopic} unique data points for the given topic in ${language}.

## Requirements:
- Return only a valid JSON array
- Each object should be different but related to the topic
- All text must be in ${language}
- No explanations or extra text
`;

  const prompt = `
Generate ${rowsPerTopic} high-quality, diverse data points about "${topic}" as ${dataType} in ${language}.

## Requirements:
- Ensure each data point is clear, self-contained, and immediately understandable without additional context
- Make every data point completely independent—avoid cross-references, pronouns referring to other entries, or sequential dependencies
- Vary sentence structure, complexity, and vocabulary to create natural diversity across all data points
- Use authentic, natural ${language} appropriate for the context and domain
- Ensure factual accuracy and cultural appropriateness for ${language} speakers
- Return ONLY a valid JSON array with no additional text, explanations, or markdown formatting

Follow this specific description and constraints:
${descriptionPrompt}
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
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Extract JSON array from response
    const jsonStart = generatedText.indexOf("[");
    if (jsonStart === -1) {
      console.warn("No JSON array found in Gemini response");
      return [];
    }

    const jsonEnd = generatedText.lastIndexOf("]");
    if (jsonEnd === -1) {
      console.warn("Incomplete JSON array in Gemini response");
      return [];
    }

    const jsonStr = generatedText.substring(jsonStart, jsonEnd + 1);
    const parsedData = JSON.parse(jsonStr) as SyntheticDataPoint[];

    if (Array.isArray(parsedData)) {
      return parsedData;
    } else {
      console.warn("Generated data is not an array");
      return [];
    }
  } catch (error) {
    console.error(
      `Error generating data for topic "${topic}":`,
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType(
    metadata.nodeType,
    createDataGenerationNode,
    metadata
  );
}
