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

export interface PineconeSearchNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

function getCollection(collectionString: string): {
  host: string;
  options: Record<string, unknown>;
} {
  let url = collectionString;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  const u = new URL(url);
  const host = `${u.protocol}//${u.host}`;
  const options: Record<string, unknown> = {};
  if (u.pathname !== "/") {
    options.namespace = u.pathname.slice(1);
  }
  return { host, options };
}

export function register(nodeRegistry: NodeRegistry): void {
  const metadata: NodeMetadata = {
    category: "Input/Output",
    title: "Vector Search",
    description: "Performs a similarity search on a vector index. It takes an embedding vector as input and retrieves the top 'k' most similar items, returning their metadata and scores.",
    nodeType: "PineconeSearch",
    nodeValue: "",
    sockets: [
      { title: "Vector", type: "input", dataType: "embedding" },
      { title: "Results", type: "output", dataType: "json" },
      { title: "Status", type: "output", dataType: "string" },
    ],
    width: 320,
    height: 180,
    configParameters: [
      {
        parameterName: "Pinecone API Key",
        parameterType: "string",
        defaultValue: "",
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "API key for Pinecone",
        isNodeBodyContent: false,
        i18n: {
          en: {
            "Pinecone API Key": {
              Name: "Pinecone API Key",
              Description: "API key for Pinecone",
            },
          },
          ar: {
            "Pinecone API Key": {
              Name: "مفتاح API الخاص بـ Pinecone",
              Description: "مفتاح API للوصول إلى خدمة Pinecone",
            },
          },
        },
      },
      {
        parameterName: "Collection URL",
        parameterType: "string",
        defaultValue: "",
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Your Pinecone index endpoint URL",
        isNodeBodyContent: false,
        i18n: {
          en: {
            "Collection URL": {
              Name: "Collection URL",
              Description: "Your Pinecone index endpoint URL",
            },
          },
          ar: {
            "Collection URL": {
              Name: "رابط المجموعة",
              Description: "رابط نقطة النهاية لفهرس Pinecone الخاص بك",
            },
          },
        },
      },
      {
        parameterName: "K (neighbors)",
        parameterType: "number",
        defaultValue: 5,
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Number of nearest neighbors to retrieve",
        isNodeBodyContent: false,
        i18n: {
          en: {
            "K (neighbors)": {
              Name: "K (neighbors)",
              Description: "Number of nearest neighbors to retrieve",
            },
          },
          ar: {
            "K (neighbors)": {
              Name: "K (الجيران)",
              Description: "عدد الجيران الأقرب المراد استرجاعهم",
            },
          },
        },
      },
    ],
    i18n: {
      en: {
        category: "Input/Output",
        title: "Vector Search",
        nodeType: "Vector Search",
        description: "Performs a similarity search on a vector index. It takes an embedding vector as input and retrieves the top 'k' most similar items, returning their metadata and scores.",
      },
      ar: {
        category: "إدخال/إخراج",
        title: "بحث المتجهات",
        nodeType: "بحث المتجهات",
        description: "يُجري بحثاً عن التشابه في فهرس المتجهات. يأخذ متجه تضمين كمدخل ويسترجع أعلى 'k' عنصر الأكثر تشابهاً، مُعيداً البيانات الوصفية والدرجات الخاصة بها.",
      },
    },
  };

  function createPineconeSearchNode(
    id: number,
    position: Position
  ): PineconeSearchNode {
    return {
      id,
      category: metadata.category,
      title: metadata.title,
      nodeValue: metadata.nodeValue,
      nodeType: metadata.nodeType,
      sockets: [
        {
          id: id * 100 + 1,
          title: "Vector",
          type: "input",
          nodeId: id,
          dataType: "embedding",
        },
        {
          id: id * 100 + 2,
          title: "Results",
          type: "output",
          nodeId: id,
          dataType: "json",
        },
        {
          id: id * 100 + 3,
          title: "Status",
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
        const n = context.node as PineconeSearchNode;

        try {
          // Get config parameters
          const collectionUrl =
            (n.getConfigParameter?.("Collection URL")?.paramValue as string) ||
            "";
          const k =
            Number(n.getConfigParameter?.("K (neighbors)")?.paramValue) || 5;

          const rawVector = context.inputs[n.id * 100 + 1];

          if (!collectionUrl) {
            throw new Error("Collection URL is required (set in config).");
          }
          if (!rawVector) {
            throw new Error("Vector input is required.");
          }

          let vector: number[] | null = null;
          if (
            Array.isArray(rawVector) &&
            rawVector.every((v) => typeof v === "number")
          ) {
            vector = rawVector;
          } else if (typeof rawVector === "string") {
            try {
              const parsed = JSON.parse(rawVector);
              if (
                Array.isArray(parsed) &&
                parsed.every((v) => typeof v === "number")
              ) {
                vector = parsed;
              }
            } catch {
              throw new Error(
                "Invalid vector input. Must be number[] or JSON stringified number[]."
              );
            }
          }
          if (!vector) throw new Error("Invalid vector format.");

          const apiKey =
            (n.getConfigParameter?.("Pinecone API Key")
              ?.paramValue as string) || "";
          if (!apiKey)
            throw new Error("Pinecone API Key is required (set in config).");

          const { host, options } = getCollection(collectionUrl);

          const response = await fetch(`${host}/query`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "api-key": apiKey,
            },
            body: JSON.stringify({
              vector,
              topK: k,
              includeMetadata: true,
              ...options,
            }),
          });

          if (!response.ok) {
            throw new Error(`Pinecone query error: ${await response.text()}`);
          }

          const result = (await response.json()) as {
            matches?: Array<{
              id: string;
              score: number;
               values?: number[];
              metadata?: Record<string, unknown>;
            }>;
            [key: string]: unknown;
          };
          return {
            [n.id * 100 + 2]: result,
            [n.id * 100 + 3]: `Query returned ${
              result.matches?.length ?? 0
            } results`,
          };
        } catch (error) {
          return {
            [n.id * 100 + 2]: null,
            [n.id * 100 + 3]: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          };
        }
      },

      configParameters: metadata.configParameters,

      getConfigParameters: function (): ConfigParameterType[] {
        return this.configParameters || [];
      },
      getConfigParameter(
        parameterName: string
      ): ConfigParameterType | undefined {
        return (this.configParameters ?? []).find(
          (param) => param.parameterName === parameterName
        );
      },
         setConfigParameter(parameterName: string, value: string | number | boolean | undefined): void {
        const parameter = (this.configParameters ?? []).find(
          (param) => param.parameterName === parameterName
        );
        if (parameter) {
          parameter.paramValue = value;
        }
      },
    };
  }

  nodeRegistry.registerNodeType(
    "VectorSearch",
    createPineconeSearchNode,
    metadata
  );
}
