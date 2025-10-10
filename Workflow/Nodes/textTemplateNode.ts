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

export interface TextNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}
// Template processing utility function - shared across multiple node types
const processTextTemplate = async (
  template: string,
  input: string,
  nodeId: number
): Promise<string> => {
  // Handle {{input}} variable
  const inputRegex = /\{\{input\}\}/g;
  let result = template;

  if (inputRegex.test(template)) {
    // Replace {{input}} with the actual input value, or empty string if undefined
    result = template.replace(inputRegex, input);
  }

  return result;
};

/**
 * Register the "Text" node type with the provided NodeRegistry.
 *
 * Creates a node type that produces TextNode instances capable of interpolating a text template (default "{{input}}")
 * with the node's input value. When a TextNode processes input, it coerces the input to a string: `undefined` or `null`
 * becomes an empty string, non-strings are converted via `JSON.stringify` (2-space indentation), and strings are used as-is.
 *
 * @param nodeRegistry - The registry where the "Text" node type will be registered
 */
export function register(nodeRegistry: NodeRegistry): void {
  const metadata: NodeMetadata = {
    category: "Text",
    title: "Text",
    nodeType: "Text",
    nodeValue: "{{input}}",
    sockets: [
      { title: "Input", type: "input", dataType: "string" },
      { title: "Output", type: "output", dataType: "string" },
    ],
    width: 380,
    height: 220,
    configParameters: [
      {
        parameterName: "Text Input",
        parameterType: "text",
        defaultValue: "{{input}}",
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Text template to interpolate with input",
        isNodeBodyContent: true,
        i18n: {
          en: {
            "Text Input": {
              Name: "Text Input",
              Description: "Text template to interpolate with input",
            },
          },
          ar: {
            "Text Input": {
              Name: "القالب النصي",
              Description: "قالب نصي يُدمج مع البيانات المُدخلة",
            },
          },
        },
      },
    ],
  };

  function createTextNode(id: number, position: Position): TextNode {
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
        // If the node value is a string and contains template variables, process them
        const n = context.node as TextNode;

        if (typeof n.nodeValue === "string") {
         const rawInput = context.inputs[n.id * 100 + 1];
         let input: string;
         if (rawInput === undefined || rawInput === null) {
          input = "";
         } else if (typeof rawInput !== "string") {
          input = JSON.stringify(rawInput, null, 2);
         } else {
            input = rawInput;
         }
         return processTextTemplate(n.nodeValue, input, n.id);
        }
        return n.nodeValue;
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

  nodeRegistry.registerNodeType("Text", createTextNode, metadata);
}