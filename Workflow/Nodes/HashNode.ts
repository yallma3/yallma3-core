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
  Position,
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  NodeMetadata,
  DataType,
} from "../types/types";
import { NodeRegistry } from "../NodeRegistry";
import { createHash } from "crypto";

export type HashAlgorithm = "MD5" | "SHA1" | "SHA256" | "SHA512";

export interface HashNode extends BaseNode {
  nodeType: "Hash";
  nodeValue?: NodeValue;
  algorithm: HashAlgorithm;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "Data",
  title: "Hash",
  nodeType: "Hash",
  nodeValue: "SHA256",
  sockets: [
    { title: "Input", type: "input", dataType: "string" },
    { title: "Hash", type: "output", dataType: "string" },
  ],
  width: 380,
  height: 220,
  configParameters: [
    {
      parameterName: "Algorithm",
      parameterType: "string",
      defaultValue: "SHA256",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Hashing algorithm to use (MD5, SHA1, SHA256, SHA512)",
      isNodeBodyContent: true,
      sourceList: [
        { key: "MD5", label: "MD5" },
        { key: "SHA1", label: "SHA1" },
        { key: "SHA256", label: "SHA256" },
        { key: "SHA512", label: "SHA512" },
      ],
    },
  ],
};

export function createHashNode(id: number, position: Position): HashNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: "Hash",
    algorithm: "SHA256", // default algorithm
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
        // Get input value
        const inputValue = await context.inputs[id * 100 + 1];
        const inputText = inputValue !== undefined ? String(inputValue) : "";

        console.log(
          `Executing Hash node ${id} with input: ${inputText.substring(
            0,
            100
          )}...`
        );

        // Get selected algorithm from config
        const algoParam = context.node.configParameters?.find(
          (param: ConfigParameterType) => param.parameterName === "Algorithm"
        );
        const algo =
          (algoParam?.paramValue as HashAlgorithm) ||
          (algoParam?.defaultValue as HashAlgorithm) ||
          "SHA256";

        let hash: string;
        let algorithmName: string;

        switch (algo) {
          case "MD5":
            hash = createHash("md5").update(inputText).digest("hex");
            algorithmName = "md5";
            break;
          case "SHA1":
            hash = createHash("sha1").update(inputText).digest("hex");
            algorithmName = "sha1";
            break;
          case "SHA512":
            hash = createHash("sha512").update(inputText).digest("hex");
            algorithmName = "sha512";
            break;
          case "SHA256":
          default:
            hash = createHash("sha256").update(inputText).digest("hex");
            algorithmName = "sha256";
        }

        console.log(
          `Hash node ${id} generated ${algorithmName} hash: ${hash.substring(
            0,
            16
          )}...`
        );

        return {
          [id * 100 + 2]: hash,
        };
      } catch (error) {
        console.error("Error in Hash node:", error);
        return {
          [id * 100 + 2]: "",
        };
      }
    },

    getConfigParameters(): ConfigParameterType[] {
      return this.configParameters || [];
    },

    getConfigParameter(parameterName: string): ConfigParameterType | undefined {
      return (this.configParameters ?? []).find(
        (param: ConfigParameterType) => param.parameterName === parameterName
      );
    },

    setConfigParameter(
      parameterName: string,
      value: string | number | boolean
    ): void {
      if (parameterName === "Algorithm") {
        this.algorithm = value as HashAlgorithm;
        this.nodeValue = String(value); // ensure it's stored as string
      }
      const parameter = (this.configParameters ?? []).find(
        (param: ConfigParameterType) => param.parameterName === parameterName
      );
      if (parameter) {
        parameter.paramValue = value;
      }
    },
  };
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType(metadata.nodeType, createHashNode, metadata);
}
