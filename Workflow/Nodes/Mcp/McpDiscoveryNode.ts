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

import type { NodeRegistry } from "../../NodeRegistry";
import type {
  BaseNode,
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  NodeMetadata,
  Position,
} from "../../types/types";

import { McpHttpClient } from "../../../Utils/McpHttpClient";
import { McpSTDIOClient } from "../../../Utils/McpStdioClient";

export interface McpDiscoveryNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}
const metadata: NodeMetadata = {
  category: "MCP",
  title: "MCP Discovery",
  nodeType: "McpDiscovery",
  nodeValue: "",
  sockets: [
    { title: "Input", type: "input", dataType: "string" },
    { title: "Tools", type: "output", dataType: "string" },
    { title: "Propmts", type: "output", dataType: "string" },
    { title: "Resources", type: "output", dataType: "string" },
  ],
  width: 300,
  height: 320,
  configParameters: [
    {
      parameterName: "Transport Type",
      parameterType: "string",
      defaultValue: "Http",
      valueSource: "UserInput",
      UIConfigurable: true,
      sourceList: [
        { key: "http", label: "Http" },
        { key: "stdio", label: "Stdio" },
      ],
      description: "Transport mechanism to use for communication",
      isNodeBodyContent: false,
    },
    {
      parameterName: "MCP Server URL",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "URL of the MCP server to connect to",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Authentication Token",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Authentication token for the MCP server (if required)",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Command",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Command to run MCP server",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Args",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Command Args separated by ','",
      isNodeBodyContent: false,
    },
  ],
};

/**
 * Create a McpDiscoveryNode configured with sockets, layout, configuration parameters, and a processing function that discovers MCP server capabilities.
 *
 * @param id - Unique node identifier used to compute socket ids
 * @param position - Initial x and y coordinates for the node's placement
 * @returns A fully initialized McpDiscoveryNode ready for registration and execution in the node registry
 */
export function createNMcpDiscoveryNode(
  id: number,
  position: Position
): McpDiscoveryNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: [
      {
        id: id * 100 + 1,
        title: "Input",
        type: "input",
        nodeId: id,
        dataType: "string",
      },
      {
        id: id * 100 + 2,
        title: "Tools",
        type: "output",
        nodeId: id,
        dataType: "string",
      },
      {
        id: id * 100 + 3,
        title: "Prompts",
        type: "output",
        nodeId: id,
        dataType: "string",
      },
      {
        id: id * 100 + 4,
        title: "Resources",
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
      const n = context.node as McpDiscoveryNode;
      const inputValue = await context.inputs[n.id * 100 + 1];
      let client = null;

      try {
        // Extract MCP server configuration from config parameters
        let url = "";
        let command = "";
        let args = "";
        let transportType = "Http"; // Default transport type

        if (n.getConfigParameter) {
          url =
            (n.getConfigParameter("MCP Server URL")?.paramValue as string) ||
            "";
          command =
            (n.getConfigParameter("Command")?.paramValue as string) || "";
          args = (n.getConfigParameter("Args")?.paramValue as string) || "";
          transportType =
            (n.getConfigParameter("Transport Type")?.paramValue as string) ||
            "Http";
        }

        if (!url && transportType == "Http") {
          throw new Error("MCP Server URL not configured");
        }

        console.log(
          `Executing MCP Discovery node ${n.id} with input: "${inputValue}"`
        );
        console.log(
          `Connecting to MCP server at: ${url} using ${transportType} transport`
        );

        if (transportType === "Stdio") {
          if (!command) {
            throw "Command Required";
          }
          const argsArray = args ? args.split(" ") : [];
          console.log(argsArray);
          const serverConfig = {
            command: command,
            args: argsArray,
          };
          client = new McpSTDIOClient(serverConfig);
          console.log("STDIO Client Created");
        } else if (transportType === "Http") {
          client = new McpHttpClient(url);
        } else {
          throw new Error("Unsupported Transport Type:" + transportType);
        }

        if (client) {
          await client.init();
          console.log("listing capabilities");
          let tools = await client.listTools();
          let prompts = await client.listPrompts();
          let resources = await client.listResources();
          await client.close();

          return {
            [n.id * 100 + 2]: JSON.stringify(tools, null, 2),
            [n.id * 100 + 3]: JSON.stringify(prompts, null, 2),
            [n.id * 100 + 4]: JSON.stringify(resources, null, 2),
          };
        } else {
          return "Failed to create Discovery";
        }

        // Process the response
      } catch (error) {
        console.error("Error in MCP Discovery node:", error);

        // Return error in the response output
        if (client) {
          await client.close();
        }
        return {
          [n.id * 100 + 2]: `Error: ${
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
      const parameter = (this.configParameters ?? []).find(
        (param) => param.parameterName === parameterName
      );
      return parameter;
    },
    setConfigParameter(parameterName, value): void {
      const parameter = (this.configParameters ?? []).find(
        (param) => param.parameterName === parameterName
      );
      if (parameter) {
        parameter.paramValue = value;
      }
    },
  };
}

/**
 * Register the McpDiscovery node type in the given node registry.
 *
 * @param nodeRegistry - The registry where the "McpDiscovery" node type will be registered using the node factory and associated metadata.
 */
export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType(
    "McpDiscovery",
    createNMcpDiscoveryNode,
    metadata
  );
}