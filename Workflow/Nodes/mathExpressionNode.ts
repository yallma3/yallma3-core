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
  NodeMetadata,
  NodeExecutionContext,
} from "../types/types";
import { NodeRegistry } from "../NodeRegistry";
export interface MathExpressionNode extends BaseNode {
  nodeType: string;
}

export function register(nodeRegistry: NodeRegistry): void {
  const metadata: NodeMetadata = {
    category: "Math",
    title: "Math Expression",
    nodeType: "MathExpression",
     description: "Evaluates a mathematical expression using an input variable 'x'. The expression is configured in the node settings, and the node replaces 'x' with the value from the input socket before computing the result.",
    nodeValue: 0,
    sockets: [
      { title: "Input", type: "input", dataType: "string" },
      { title: "Output", type: "output", dataType: "string" },
    ],
    width: 300,
    height: 220,
    configParameters: [
      {
        parameterName: "Expression",
        parameterType: "number",
        defaultValue: false,
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Default Number output",
        isNodeBodyContent: true,
      },
    ],
  };
  function createMathExpressionNode(
    id: number,
    position: Position,
    nodeValue: number = 0
  ): BaseNode {
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
      process: async (context: NodeExecutionContext): Promise<number> => {
        const n = context.node as MathExpressionNode;

        const a = Number(context.inputs[n.id * 100 + 1]) || 0;
        const b = Number(context.inputs[n.id * 100 + 2]) || 0;

        nodeValue = a + b;
        return nodeValue;
      },
      configParameters: metadata.configParameters,
      getConfigParameters: function (): ConfigParameterType[] {
        return this.configParameters || [];
      },
      getConfigParameter(
        parameterName: string
      ): ConfigParameterType | undefined {
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
  nodeRegistry.registerNodeType(
    "MathExpression",
    createMathExpressionNode,
    metadata
  );
}
