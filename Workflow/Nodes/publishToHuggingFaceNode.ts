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
import { uploadFile } from "@huggingface/hub";

interface DatasetInput {
  dataset: Array<Record<string, any>>;
  metadata: {
    domain_type: string;
    data_type: string;
    language: string;
    iso_language: string;
    total_rows: number;
    generation_date: string;
  };
}

interface StatisticsInput {
  total_generated: number;
  requested_count: number;
  topics_processed: number;
  topics_failed: number;
  success_rate: string;
  generation_time_seconds: number;
  rows_per_topic: number;
  parallel_agents: number;
}

export interface HuggingFacePublisherNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "Data Generation",
  title: "HuggingFace Publisher",
  nodeType: "HuggingFacePublisher",
  description: "Publishes a generated dataset to the Hugging Face Hub. This node automates repository creation, dataset and README file uploads, and provides the final URL and publication metadata as output.",
  nodeValue: "",
  sockets: [
    { title: "Dataset", type: "input", dataType: "json" },
    { title: "Statistics", type: "input", dataType: "json" },
    { title: "Dataset URL", type: "output", dataType: "string" },
    { title: "Publication Info", type: "output", dataType: "json" },
    { title: "Status", type: "output", dataType: "string" },
  ],
  width: 350,
  height: 320,
  configParameters: [
    {
      parameterName: "HuggingFace Token",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description:
        "HuggingFace write access token (get from hf.co/settings/tokens)",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Repository Name",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Dataset repository name (e.g., username/dataset-name)",
      isNodeBodyContent: true,
    },
    {
      parameterName: "Dataset Description",
      parameterType: "text",
      defaultValue: "Synthetic dataset generated using yaLLMa3 pipeline",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Description of the dataset",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Private Dataset",
      parameterType: "boolean",
      defaultValue: false,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Make dataset private (requires Pro subscription)",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Auto Generate README",
      parameterType: "boolean",
      defaultValue: true,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Automatically generate README with dataset information",
      isNodeBodyContent: false,
    },
  ],
};

function getStringConfig(param: ConfigParameterType | undefined): string {
  if (!param) return "";
  const value = param.paramValue ?? param.defaultValue;
  return typeof value === "string" ? value : String(value);
}

function getBooleanConfig(param: ConfigParameterType | undefined): boolean {
  if (!param) return false;
  const value = param.paramValue ?? param.defaultValue;
  return typeof value === "boolean" ? value : Boolean(value);
}

export function createHuggingFacePublisherNode(
  id: number,
  position: Position
): HuggingFacePublisherNode {
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
        const datasetInput = await context.inputs[id * 100 + 1];
        const statisticsInput = await context.inputs[id * 100 + 2];

        if (!datasetInput) {
          throw new Error("Dataset input is required");
        }

        console.log(
          `[HuggingFace Publisher Node ${id}] Starting dataset publication...`
        );
        const datasetData: DatasetInput =
          typeof datasetInput === "string"
            ? JSON.parse(datasetInput)
            : datasetInput;

        const statistics: StatisticsInput | null = statisticsInput
          ? typeof statisticsInput === "string"
            ? JSON.parse(statisticsInput)
            : statisticsInput
          : null;

        const hfToken = getStringConfig(
          context.node.configParameters?.find(
            (p) => p.parameterName === "HuggingFace Token"
          )
        );

        const repoName = getStringConfig(
          context.node.configParameters?.find(
            (p) => p.parameterName === "Repository Name"
          )
        );

        const description = getStringConfig(
          context.node.configParameters?.find(
            (p) => p.parameterName === "Dataset Description"
          )
        );

        const isPrivate = getBooleanConfig(
          context.node.configParameters?.find(
            (p) => p.parameterName === "Private Dataset"
          )
        );

        const autoReadme = getBooleanConfig(
          context.node.configParameters?.find(
            (p) => p.parameterName === "Auto Generate README"
          )
        );

        if (!hfToken) {
          throw new Error(
            "HuggingFace Token is required. Get one from https://huggingface.co/settings/tokens"
          );
        }

        if (!repoName) {
          throw new Error(
            "Repository Name is required (format: username/dataset-name)"
          );
        }

        console.log(
          `[HuggingFace Publisher Node ${id}] Publishing to ${repoName}...`
        );

        const repoUrl = await createOrGetRepository(
          hfToken,
          repoName,
          description,
          isPrivate
        );

        console.log(
          `[HuggingFace Publisher Node ${id}] Repository ready: ${repoUrl}`
        );
        const datasetJson = prepareDatasetJson(datasetData);
        const readme = autoReadme
          ? generateReadme(datasetData, statistics, repoName)
          : null;

        console.log(
          `[HuggingFace Publisher Node ${id}] Uploading dataset files...`
        );

        const uploadResults = await uploadDatasetFiles(
          hfToken,
          repoName,
          datasetJson,
          readme
        );

        console.log(
          `[HuggingFace Publisher Node ${id}] ✅ Dataset published successfully!`
        );

        const publicationInfo = {
          repository_url: repoUrl,
          dataset_url: `${repoUrl}/viewer`,
          files_uploaded: uploadResults.files,
          total_rows: datasetData.metadata.total_rows,
          language: datasetData.metadata.language,
          data_type: datasetData.metadata.data_type,
          published_at: new Date().toISOString(),
          private: isPrivate,
        };

        return {
          [id * 100 + 3]: repoUrl,
          [id * 100 + 4]: JSON.stringify(publicationInfo, null, 2),
          [id * 100 +
          5]: `Success: Published ${datasetData.metadata.total_rows} rows to HuggingFace at ${repoUrl}`,
        };
      } catch (error) {
        console.error(`[HuggingFace Publisher Node ${id}] ❌ Error:`, error);

        return {
          [id * 100 + 3]: "",
          [id * 100 + 4]: JSON.stringify({ error: true }, null, 2),
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

async function createOrGetRepository(
  token: string,
  repoName: string,
  description: string,
  isPrivate: boolean
): Promise<string> {
  const [namespace, name] = repoName.split("/");

  if (!namespace || !name) {
    throw new Error(
      "Invalid repository name format. Use: username/dataset-name"
    );
  }

  const url = `https://huggingface.co/api/repos/create`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "dataset",
        name: name,
        organization: namespace === namespace ? undefined : namespace,
        private: isPrivate,
      }),
    });

    if (response.ok || response.status === 409) {
      return `https://huggingface.co/datasets/${repoName}`;
    } else {
      const errorText = await response.text();
      throw new Error(`Failed to create repository: ${errorText}`);
    }
  } catch (error) {
    throw new Error(
      `Repository creation failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function prepareDatasetJson(datasetData: DatasetInput): string {
  return datasetData.dataset.map((item) => JSON.stringify(item)).join("\n");
}

function generateReadme(
  datasetData: DatasetInput,
  statistics: StatisticsInput | null,
  repoName: string
): string {
  const { metadata } = datasetData;
  const sampleData = datasetData.dataset.slice(0, 3);

  const firstSample = sampleData[0];
  const dataFields = firstSample
    ? Object.keys(firstSample)
        .map((key) => `- \`${key}\`: ${typeof firstSample[key]}`)
        .join("\n")
    : "No data fields available";

  return `---
  language:
  - ${metadata.iso_language}
  task_categories:
  - question-answering
  - text-classification
  size_categories:
  - ${
    metadata.total_rows < 1000
      ? "n<1K"
      : metadata.total_rows < 10000
      ? "1K<n<10K"
      : "10K<n<100K"
  }
  tags:
  - synthetic
  - ${metadata.domain_type}
  - generated
  ---
  
  # ${repoName.split("/")[1]}
  
  ## Dataset Description
  
  This is a synthetic dataset generated using the yaLLMa3 pipeline for ${
    metadata.data_type
  } tasks in ${metadata.language}.
  
  ### Dataset Summary
  
  - **Domain**: ${metadata.domain_type}
  - **Data Type**: ${metadata.data_type}
  - **Language**: ${metadata.language} (${metadata.iso_language})
  - **Total Rows**: ${metadata.total_rows}
  - **Generated**: ${new Date(metadata.generation_date).toLocaleDateString()}
  
  ${
    statistics
      ? `
  ### Generation Statistics
  
  - **Topics Processed**: ${statistics.topics_processed}
  - **Success Rate**: ${statistics.success_rate}%
  - **Generation Time**: ${statistics.generation_time_seconds.toFixed(2)}s
  - **Rows Per Topic**: ${statistics.rows_per_topic}
  `
      : ""
  }
  
  ## Dataset Structure
  
  ### Data Fields
  
  ${dataFields}
  
  ### Data Samples
  
  \`\`\`json
  ${JSON.stringify(sampleData, null, 2)}
  \`\`\`
  
  ## Usage
  
  \`\`\`python
  from datasets import load_dataset
  
  dataset = load_dataset("${repoName}")
  \`\`\`
  
  ## Citation
  
  This dataset was generated using yaLLMa3 synthetic data generation pipeline.
  
  ## License
  
  Please check the repository settings for license information.
  `;
}

async function uploadDatasetFiles(
  token: string,
  repoName: string,
  datasetJsonl: string,
  readme: string | null
): Promise<{ files: string[] }> {
  const uploadedFiles: string[] = [];

  try {
    await uploadFile({
      repo: {
        type: "dataset",
        name: repoName,
      },
      file: {
        path: "dataset.jsonl",
        content: new Blob([datasetJsonl], { type: "text/plain" }),
      },
      credentials: {
        accessToken: token,
      },
      commitTitle: "Upload dataset from yaLLMa3",
    });
    uploadedFiles.push("dataset.jsonl");
    console.log(`  ✓ Uploaded dataset.jsonl`);
    if (readme) {
      await uploadFile({
        repo: {
          type: "dataset",
          name: repoName,
        },
        file: {
          path: "README.md",
          content: new Blob([readme], { type: "text/markdown" }),
        },
        credentials: {
          accessToken: token,
        },
        commitTitle: "Upload README from yaLLMa3",
      });
      uploadedFiles.push("README.md");
      console.log(`  ✓ Uploaded README.md`);
    }

    return { files: uploadedFiles };
  } catch (error) {
    console.error("Upload failed:", error);
    throw new Error(
      `Failed to upload files: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType(
    metadata.nodeType,
    createHuggingFacePublisherNode,
    metadata
  );
}
