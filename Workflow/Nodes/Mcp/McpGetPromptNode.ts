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
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  NodeMetadata,
  Position,
} from "../../types/types";
import { NodeRegistry } from "../../NodeRegistry";
import { McpHttpClient } from "../../../Utils/McpHttpClient";
import { McpSTDIOClient } from "../../../Utils/McpStdioClient";

export interface McpGetPromptlNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}
const metadata: NodeMetadata = {
  category: "MCP",
  title: "MCP Prompt",
  nodeType: "McpGetPrompt",
  nodeValue: "",
  sockets: [
    { title: "Prompt", type: "input", dataType: "string" },
    { title: "Output", type: "output", dataType: "string" },
  ],
  width: 300,
  height: 320,
  configParameters: [
    {
      parameterName: "Transport Type",
      parameterType: "string",
      defaultValue: "http",
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
      description: "Command Args",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Prompt",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Prompt to be returned",
      isNodeBodyContent: false,
    },
  ],
};

export function createNMcpGetPromptlNode(
  id: number,
  position: Position
): McpGetPromptlNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: [
      {
        id: id * 100 + 1,
        title: "Prompt",
        type: "input",
        nodeId: id,
        dataType: "string",
      },
      {
        id: id * 100 + 2,
        title: "Output",
        type: "output",
        nodeId: id,
        dataType: "string",
      },
    ],
    x: position.x,
    y: position.y,
    width: 300,
    height: 200,
    selected: false,
    processing: false,
    process: async (context: NodeExecutionContext) => {
      const n = context.node as McpGetPromptlNode;
      const inputValue = await context.inputs[n.id * 100 + 1];
      let client = null;
      try {
        // Extract MCP server configuration from config parameters
        let url = "";
        let command = "";
        let args = "";
        let transportType = "Http"; // Default transport type

        let prompt = "";

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

          prompt = (n.getConfigParameter("Prompt")?.paramValue as string) || "";
        }

        if (!url && transportType == "Http") {
          throw new Error("MCP Server URL not configured");
        }

        console.log(
          `Executing MCP Prompt node ${n.id} with input: "${inputValue}"`
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
          console.log("Creating STDIO Client");
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

          let result = await client.getPrompt(prompt);

          return {
            [n.id * 100 + 2]: JSON.stringify(result, null, 2),
          };
        } else {
          return "Failed to create Prompt";
        }

        // Process the response
      } catch (error) {
        console.error("Error in MCP Prompt node:", error);
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

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType(
    metadata.nodeType,
    createNMcpGetPromptlNode,
    metadata
  );
}
