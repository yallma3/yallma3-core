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

export interface JoinNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

export function register(nodeRegistry: NodeRegistry): void {
  const metadata: NodeMetadata = {
    category: "Text",
    title: "Join",
    nodeType: "Join",
    nodeValue: " ",
    sockets: [
      { title: "Input 1", type: "input", dataType: "unknown" },
      { title: "Input 2", type: "input", dataType: "unknown" },
      { title: "Output", type: "output", dataType: "string" },
    ],
    width: 240,
    height: 230,
    configParameters: [
      {
        parameterName: "Separator",
        parameterType: "text",
        defaultValue: " ",
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Separator to join the inputs",
        isNodeBodyContent: true,
        i18n: {
          en: {
            Separator: {
              Name: "Separator",
              Description: "Separator to join the inputs",
            },
          },
          ar: {
            Separator: {
              Name: "الفاصلة",
              Description: "فاصلة للدمج بين المدخلات",
            },
          },
        },
      },
    ],
  };

  function createJoinNode(id: number, position: Position): JoinNode {
    return {
      id,
      category: metadata.category,
      title: metadata.title,
      nodeValue: metadata.nodeValue,
      nodeType: metadata.nodeType,
      sockets: [
        {
          id: id * 100 + 1,
          title: "Input 1",
          type: "input",
          nodeId: id,
          dataType: "unknown",
        },
        {
          id: id * 100 + 2,
          title: "Input 2",
          type: "input",
          nodeId: id,
          dataType: "unknown",
        },
        {
          id: id * 100 + 111,
          title: "Output",
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
        const n = context.node as JoinNode;
        // Process special separator values
        let separator = String(n.nodeValue || "");

        // Replace special separator placeholders
        separator = separator
          .replace(/\(new line\)/g, "\n") // Replace (new line) with actual newline
          .replace(/\\n/g, "\n"); // Also support \n for newlines

        // Count input sockets to determine how many inputs to process
        // const inputSockets = n.sockets.filter((s) => s.type === "input");

        // Collect all input values
        // const inputValues = await Promise.all(
        //   inputSockets.map(async (socket) => {
        //     const value = await context.getInputValue(socket.id);
        //     return value !== undefined ? String(value) : "";
        //   })
        // );
        const result = Object.values(context.inputs)
          .filter((val) => typeof val === "string" && val !== "")
          .join(separator);

        // Join all non-empty values with the separator
        return result;
      },
      configParameters: metadata.configParameters,

      getConfigParameters: function (): ConfigParameterType[] {
        return this.configParameters || [];
      },
      getConfigParameter(parameterName) {
        const parameter = (this.configParameters ?? []).find(
          (param) => param.parameterName === parameterName
        );
        return parameter;
      },
      setConfigParameter(parameterName, value) {
        const parameter = (this.configParameters ?? []).find(
          (param) => param.parameterName === parameterName
        );
        if (parameter) {
          parameter.paramValue = value;
        }
      },
    };
  }

  nodeRegistry.registerNodeType("Join", createJoinNode, metadata);
}
