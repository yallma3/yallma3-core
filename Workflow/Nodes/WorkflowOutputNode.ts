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

export interface WorkflowOutput extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

export function register(nodeRegistry: NodeRegistry): void {
  const metadata: NodeMetadata = {
    category: "Workflow",
    title: "Workflow Output",
    nodeType: "WorkflowOutput",
    nodeValue: "Workflow Output",
        description: "Provides a way to pass concluded workflow result to next tasks. If the workflow doesn't have a Workflow Output node, the workflow output is computed dynamically from all leaf nodes in the workflow.",
    sockets: [{ title: "Input", type: "input", dataType: "string" }],
    width: 380,
    height: 220,
    configParameters: [],
    i18n: {
      en: {
        category: "Workflow",
        title: "Workflow Output",
        nodeType: "WorkflowOutput",
    description: "Provides a way to pass concluded workflow result to next tasks. If the workflow doesn't have a Workflow Output node, the workflow output is computed dynamically from all leaf nodes in the workflow.",
      },
      ar: {
        category: "سير العمل",
        title: "مخرجات سير العمل",
        nodeType: "مخرجات سير العمل",
        description: "يوفر طريقة لتمرير نتيجة سير العمل المكتملة إلى المهام التالية.",
      },
    },
    allowedCount: 1,
  };

  function createWorkflowOutputNode(
    id: number,
    position: Position
  ): WorkflowOutput {
    return {
      id,
      category: metadata.category,
      title: metadata.title,
      nodeValue: metadata.nodeValue,
      nodeType: metadata.nodeType,
      sockets: [
        {
          id: id * 100 + 2,
          title: "Input",
          type: "input",
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
        const input = context.inputs[id * 100 + 2] ?? context.inputs[0];
        if (input !== undefined && input !== null) {
          if (typeof input === 'string') {
            console.log("📤 Workflow Output:", input.substring(0, 200) + "...");
            return input;
          }
          const output = typeof input === 'object' ? JSON.stringify(input, null, 2) : String(input);
          console.log("📤 Workflow Output:", output.substring(0, 200) + "...");
          return output;
        }
        console.log("No workflow output provided");
        return "No Workflow Output";
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
    "WorkflowOutput",
    createWorkflowOutputNode,
    metadata
  );
}
