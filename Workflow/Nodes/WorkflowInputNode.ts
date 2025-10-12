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

export interface WorkflowInput extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

export function register(nodeRegistry: NodeRegistry): void {
  const metadata: NodeMetadata = {
    category: "Input/Output",
    title: "Workflow Input",
    nodeType: "WorkflowInput",
    nodeValue: "WorkflowI Input",
    sockets: [{ title: "Output", type: "output", dataType: "string" }],
    width: 380,
    height: 220,
    configParameters: [],
  };

  function createWorkflowInputNode(
    id: number,
    position: Position
  ): WorkflowInput {
    return {
      id,
      category: metadata.category,
      title: metadata.title,
      nodeValue: metadata.nodeValue,
      nodeType: metadata.nodeType,
      sockets: [
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
        let output = "No Workflow Input";
        const input = context.inputs[0];
        if (input) output = input;
        console.log("Task Input:", output);
        return output;
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

  nodeRegistry.registerNodeType(
    "WorkflowInput",
    createWorkflowInputNode,
    metadata
  );
}
