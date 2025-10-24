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
  NodeExecutionContext,
  NodeValue,
  NodeMetadata,
  Position,
  DataType,
} from "../types/types";
import { NodeRegistry } from "../NodeRegistry";

export interface DelayNode extends BaseNode {
  nodeType: string;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "Logic",
  title: "Delay (ms)",
  nodeType: "Delay",
  description: "How long to wait before passing the value through (in ms).",
  nodeValue: 1000,
  sockets: [
    { title: "Input", type: "input", dataType: "unknown" },
    { title: "Output", type: "output", dataType: "unknown" },
  ],
  width: 240,
  height: 180,
  configParameters: [
    {
      parameterName: "Delay (ms)",
      parameterType: "number",
      defaultValue: 1000,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "How long to wait before passing the value through (in ms).",
      isNodeBodyContent: true,
    },
  ],
};

export function createDelayNode(id: number, position: Position): DelayNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
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
    nodeValue: metadata.nodeValue,
    configParameters: [...metadata.configParameters],

    // Process logic: wait N ms, then pass input to output
    process: async (context) => {
      const inputValue = await context.inputs[id * 100 + 1];

      // Get delay time from config parameter
      const delayParam = context.node.configParameters?.find(
        (param: ConfigParameterType) => param.parameterName === "Delay (ms)"
      );
      const delayMs = Number(
        delayParam?.paramValue ?? delayParam?.defaultValue ?? 1000
      );

      // Update node value to show current delay
      context.node.nodeValue = `${delayMs} ms`;

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      return {
        [id * 100 + 2]: inputValue,
      };
    },

    getConfigParameters(): ConfigParameterType[] {
      return this.configParameters || [];
    },

    getConfigParameter(parameterName: string): ConfigParameterType | undefined {
      return (this.configParameters ?? []).find(
        (param: ConfigParameterType) => param.parameterName === parameterName
      );
    },

    setConfigParameter(parameterName: string, value: any): void {
      const parameter = (this.configParameters ?? []).find(
        (param: ConfigParameterType) => param.parameterName === parameterName
      );
      if (parameter) {
        parameter.paramValue = value;
        if (parameterName === "Delay (ms)") {
          this.nodeValue = `${value} ms`;
        }
      }
    },
  };
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType(metadata.nodeType, createDelayNode, metadata);
}
