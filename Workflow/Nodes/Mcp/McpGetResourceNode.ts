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

export interface McpGetResourcelNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}
const metadata: NodeMetadata = {
  category: "MCP",
  title: "MCP Resource",
  nodeType: "McpGetResource",
  description: "Retrieves a specific resource by name from a Master Control Program (MCP) server. This node supports both HTTP and Stdio transport mechanisms for communication.",
  nodeValue: "",
  sockets: [
    { title: "Resource", type: "input", dataType: "string" },
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
      i18n: {
        en: {
          "Transport Type": {
            Name: "Transport Type",
            Description: "Transport mechanism to use for communication",
          },
        },
        ar: {
          "Transport Type": {
            Name: "نوع النقل",
            Description: "آلية النقل المراد استخدامها للاتصال",
          },
        },
      },
    },
    {
      parameterName: "MCP Server URL",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "URL of the MCP server to connect to",
      isNodeBodyContent: false,
      i18n: {
        en: {
          "MCP Server URL": {
            Name: "MCP Server URL",
            Description: "URL of the MCP server to connect to",
          },
        },
        ar: {
          "MCP Server URL": {
            Name: "رابط خادم MCP",
            Description: "رابط خادم MCP المراد الاتصال به",
          },
        },
      },
    },
    {
      parameterName: "Authentication Token",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Authentication token for the MCP server (if required)",
      isNodeBodyContent: false,
      i18n: {
        en: {
          "Authentication Token": {
            Name: "Authentication Token",
            Description: "Authentication token for the MCP server (if required)",
          },
        },
        ar: {
          "Authentication Token": {
            Name: "رمز المصادقة",
            Description: "رمز المصادقة لخادم MCP (إذا لزم الأمر)",
          },
        },
      },
    },
    {
      parameterName: "Command",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Command to run MCP server",
      isNodeBodyContent: false,
      i18n: {
        en: {
          "Command": {
            Name: "Command",
            Description: "Command to run MCP server",
          },
        },
        ar: {
          "Command": {
            Name: "الأمر",
            Description: "الأمر لتشغيل خادم MCP",
          },
        },
      },
    },
    {
      parameterName: "Args",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Command arguments",
      isNodeBodyContent: false,
      i18n: {
        en: {
          "Args": {
            Name: "Args",
            Description: "Command arguments",
          },
        },
        ar: {
          "Args": {
            Name: "المعاملات",
            Description: "معاملات الأمر",
          },
        },
      },
    },
    {
      parameterName: "Resource",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Resource to be returned",
      isNodeBodyContent: false,
      i18n: {
        en: {
          "Resource": {
            Name: "Resource",
            Description: "Resource to be returned",
          },
        },
        ar: {
          "Resource": {
            Name: "المورد",
            Description: "المورد المراد إرجاعه",
          },
        },
      },
    },
  ],
  i18n: {
    en: {
      category: "MCP",
      title: "MCP Resource",
      nodeType: "MCP Resource",
      description: "Retrieves a specific resource by name from a Master Control Program (MCP) server. This node supports both HTTP and Stdio transport mechanisms for communication.",
    },
    ar: {
      category: "MCP",
      title: "مورد MCP",
      nodeType: "مورد MCP",
      description: "يسترجع مورداً محدداً بالاسم من خادم برنامج التحكم الرئيسي (MCP). تدعم هذه العقدة آليات نقل HTTP وStdio للاتصال.",
    },
  },
};

export function createNMcpGetResourcelNode(
  id: number,
  position: Position
): McpGetResourcelNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: [
      {
        id: id * 100 + 1,
        title: "Resource",
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
      const n = context.node as McpGetResourcelNode;
      const inputValue = await context.inputs[n.id * 100 + 1];
      let client = null;

      try {
        // Extract MCP server configuration from config parameters
        let url = "";
        let command = "";
        let args = "";
        let transportType = "Http"; // Default transport type

        let resource = "";

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

          resource =
            (n.getConfigParameter("Resource")?.paramValue as string) || "";
        }

        if (!url && transportType == "Http") {
          throw new Error("MCP Server URL not configured");
        }

        console.log(
          `Executing MCP Resource node ${n.id} with input: "${inputValue}"`
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
          console.log(resource);

          let result = await client.getResource(resource);

          return {
            [n.id * 100 + 2]: JSON.stringify(result, null, 2),
          };
        } else {
          return "Failed to create Resource";
        }

        // Process the response
      } catch (error) {
        console.error("Error in MCP Resource node:", error);
        // Return error in the response output
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
    createNMcpGetResourcelNode,
    metadata
  );
}
