/*
 * yaLLMa3 - Framework for building AI agents that are capable of learning from their environment and interacting with it.
 * Copyright (C) 2025 yaLLMa3
 * Licensed under MPL 2.0: https://www.mozilla.org/MPL/2.0/
 */

import type { BaseNode, NodeMetadata, Position, ConfigParameterType, NodeValue, NodeExecutionContext, DataType } from "../types/types";
import { nodeRegistry } from "../NodeRegistry";

interface UrlReferenceNode extends BaseNode {
  nodeType: "UrlReference";
  url: string;
  useUrlInput?: boolean;
}

const metadata: NodeMetadata = {
  nodeType: "UrlReference",
  category: "Data",
  title: "URL Reference",
  description: "Creates a reference to a URL that can be passed to other nodes. The URL can be set directly in the configuration or provided dynamically via an input socket.",
  sockets: [
    { title: "URL", type: "input", dataType: "string" },
    { title: "URL Reference", type: "output", dataType: "url" }
  ],
  width: 300,
  height: 200,
  configParameters: [
    {
      parameterName: "URL",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Directly set the URL if not using input",
      isNodeBodyContent: true,
    },
    {
      parameterName: "Use URL Input",
      parameterType: "boolean",
      defaultValue: false,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "If true, the URL will come from the input socket",
    },
  ]
};

function createUrlReferenceNode(id: number, position: Position): UrlReferenceNode {
  return {
    id,
    nodeType: "UrlReference",
    category: metadata.category,
    title: metadata.title,
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    sockets: metadata.sockets.map((socket, index) => ({
      id: id * 100 + (socket.type === 'input' ? index + 1 : index + 101),
      title: socket.title,
      type: socket.type,
      nodeId: id,
      dataType: socket.dataType as DataType
    })),
    selected: false,
    processing: false,
    url: "",
    useUrlInput: false,
    nodeValue: "(No URL)",
    configParameters: metadata.configParameters,
    process: async (context: NodeExecutionContext) => {
      const n = context.node as UrlReferenceNode;

      let finalUrl = n.url;

      if (n.useUrlInput) {
        const inputValue = context.inputs[n.id * 100 + 1];
        if (inputValue !== undefined) {
          finalUrl = String(inputValue);
        }
      }

      // Update node body
      n.nodeValue = finalUrl || "(No URL)";

      // Return output object
      return {
        [n.id * 100 + 101]: { type: "url_reference", url: finalUrl },
      };
    },
    getConfigParameters: function(): ConfigParameterType[] {
      return this.configParameters || [];
    },
    getConfigParameter: function(parameterName: string): ConfigParameterType | undefined {
      return (this.configParameters || []).find(
        (param: ConfigParameterType) => param.parameterName === parameterName
      );
    },
    setConfigParameter: function(parameterName: string, value: string | number | boolean): void {
      if (parameterName === "URL") {
        this.url = value as string;
        this.nodeValue = value as string;
      }
      if (parameterName === "Use URL Input") {
        this.useUrlInput = Boolean(value);
        this.nodeValue = this.useUrlInput ? "(URL Using Input)" : this.url;
      }
      const parameter = (this.configParameters || []).find(
        (param: ConfigParameterType) => param.parameterName === parameterName
      );
      if (parameter) {
        parameter.paramValue = value;
      }
    }
  };
}

function register(): void {
  nodeRegistry.registerNodeType("UrlReference", createUrlReferenceNode, metadata);
}

export type { UrlReferenceNode };
export { createUrlReferenceNode, register };
