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
import * as CryptoJS from "crypto-js";

export interface PineconeStoreNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

function getCollection(collectionString: string): {
  host: string;
  options: { [key: string]: any };
} {
  let url = collectionString;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  const u = new URL(url);
  const host = `${u.protocol}//${u.host}`;
  const options: { [key: string]: any } = {};
  if (u.pathname !== "/") {
    options.namespace = u.pathname.slice(1);
  }
  return { host, options };
}

export function register(nodeRegistry: NodeRegistry): void {
  const metadata: NodeMetadata = {
    category: "VectorDatabase",
    title: "Vector Store",
    nodeType: "PineconeStore",
    nodeValue: "",
    sockets: [
      { title: "Vector", type: "input", dataType: "embedding" },
      { title: "Data", type: "input", dataType: "json" },
      { title: "Result", type: "output", dataType: "json" },
      { title: "Status", type: "output", dataType: "string" },
    ],
    width: 350,
    height: 200,
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
        description: "Full Pinecone index URL (with namespace path if needed)",
        isNodeBodyContent: false,
        i18n: {
          en: {
            "Collection URL": {
              Name: "Collection URL",
              Description: "Full Pinecone index URL (with namespace path if needed)",
            },
          },
          ar: {
            "Collection URL": {
              Name: "رابط المجموعة",
              Description: "رابط فهرس Pinecone الكامل (مع مسار المساحة إذا لزم الأمر)",
            },
          },
        },
      },
    ],
  };

  function createPineconeStoreNode(id: number, position: Position): PineconeStoreNode {
    return {
      id,
      category: metadata.category,
      title: metadata.title,
      nodeValue: metadata.nodeValue,
      nodeType: metadata.nodeType,
      sockets: [
        {
          id: id * 100 + 2,
          title: "Vector",
          type: "input",
          nodeId: id,
          dataType: "embedding",
        },
        {
          id: id * 100 + 3,
          title: "Data",
          type: "input",
          nodeId: id,
          dataType: "json",
        },
        {
          id: id * 100 + 4,
          title: "Result",
          type: "output",
          nodeId: id,
          dataType: "json",
        },
        {
          id: id * 100 + 5,
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
        const n = context.node as PineconeStoreNode;

        try {
          // Get config params
          const collectionUrl =
            (n.getConfigParameter?.("Collection URL")?.paramValue as string) || "";
          const apiKey =
            (n.getConfigParameter?.("Pinecone API Key")?.paramValue as string) || "";

          if (!collectionUrl) {
            throw new Error("Collection URL is required (set in config).");
          }
          if (!apiKey) {
            throw new Error("Pinecone API Key not found (set in config).");
          }

          // Vector input
          const rawVector = context.inputs[n.id * 100 + 2];
          let vector: number[] | null = null;

          if (Array.isArray(rawVector) && rawVector.every(v => typeof v === "number")) {
            vector = rawVector as number[];
          } else if (typeof rawVector === "string") {
            try {
              const parsed = JSON.parse(rawVector);
              if (Array.isArray(parsed) && parsed.every(v => typeof v === "number")) {
                vector = parsed;
              }
            } catch {
              throw new Error("Vector must be a number[] or JSON stringified number[]");
            }
          }
          if (!vector) {
            throw new Error("Invalid vector input. Expected number[]");
          }

          // Data / metadata input
          const data = context.inputs[n.id * 100 + 3];
          let metadata: Record<string, unknown> = {};
          if (data && typeof data === "object" && !Array.isArray(data)) {
            metadata = data as Record<string, unknown>;
          } else {
            metadata = { data };
          }

          // Collection info
          const { host, options } = getCollection(collectionUrl);

          // Deterministic vector ID
          const vectorId = CryptoJS.SHA256(vector.join(",")).toString(CryptoJS.enc.Hex);

          // Upsert to Pinecone
          const response = await fetch(`${host}/vectors/upsert`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "api-key": apiKey,
            },
            body: JSON.stringify({
              vectors: [
                {
                  id: vectorId,
                  values: vector,
                  metadata,
                },
              ],
              ...options,
            }),
          });

          if (!response.ok) {
            throw new Error(`Pinecone store error: ${await response.text()}`);
          }

          return {
            [n.id * 100 + 4]: { success: true, id: vectorId },
            [n.id * 100 + 5]: `Stored vector with id ${vectorId}`,
          };
        } catch (error) {
          return {
            [n.id * 100 + 4]: null,
            [n.id * 100 + 5]: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          };
        }
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

  nodeRegistry.registerNodeType("VectorStore", createPineconeStoreNode, metadata);
}