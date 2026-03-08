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
function buildSockets(id: number, inputCount: number): BaseNode["sockets"] {
  const sockets: BaseNode["sockets"] = [];
  for (let i = 1; i <= inputCount; i++) {
    sockets.push({
      id: id * 100 + i,
      title: `Input ${i}`,
      type: "input",
      nodeId: id,
      dataType: "unknown",
    });
  }
  sockets.push({
    id: id * 100 + 111,
    title: "Output",
    type: "output",
    nodeId: id,
    dataType: "string",
  });
  return sockets;
}
function computeHeight(inputCount: number): number {
  return 180 + inputCount * 40;
}

export function register(nodeRegistry: NodeRegistry): void {
  const DEFAULT_INPUT_COUNT = 2;
  const metadata: NodeMetadata = {
    category: "Text",
    title: "Join",
    nodeType: "Join",
    description:
      "Combines multiple text inputs. In Concatenate mode, joins them with a separator. In Substitute mode, replaces {{input1}}, {{input2}}, … placeholders inside a template.",
    nodeValue: " ",
    sockets: [
      { title: "Input 1", type: "input", dataType: "unknown" },
      { title: "Input 2", type: "input", dataType: "unknown" },
      { title: "Output", type: "output", dataType: "string" },
    ],
    width: 240,
    height: computeHeight(DEFAULT_INPUT_COUNT),
    configParameters: [
      {
        parameterName: "Mode",
        parameterType: "string",
        defaultValue: "concatenate",
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Join mode: concatenate or substitute",
        isNodeBodyContent: false,
        sourceList: [
          { key: "concatenate", label: "Concatenate" },
          { key: "substitute", label: "Substitute" },
        ],
        i18n: {
          en: {
            Mode: { Name: "Mode", Description: "Join mode: concatenate or substitute" },
          },
          ar: {
            Mode: { Name: "الوضع", Description: "وضع الدمج: تسلسل أو استبدال" },
          },
        },
      },
      {
        parameterName: "Input Count",
        parameterType: "number",
        defaultValue: DEFAULT_INPUT_COUNT,
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Number of input sockets (1–7)",
        isNodeBodyContent: false,
        i18n: {
          en: {
            "Input Count": {
              Name: "Input Count",
              Description: "Number of input sockets (1–7)",
            },
          },
          ar: {
            "Input Count": {
              Name: "عدد المدخلات",
              Description: "عدد مقابس الإدخال (١–٧)",
            },
          },
        },
      },
      {
        parameterName: "Separator",
        parameterType: "text",
        defaultValue: " ",
        valueSource: "UserInput",
        UIConfigurable: true,
        description:
          "In Concatenate mode: separator string (use (new line) for newline). " +
          "In Substitute mode: template text with {{input1}}, {{input2}}, … placeholders.",
        isNodeBodyContent: true,
        i18n: {
          en: {
            Separator: {
              Name: "Separator / Template",
              Description:
                "Separator (concatenate) or template with {{inputN}} (substitute)",
            },
          },
          ar: {
            Separator: {
              Name: "الفاصلة / القالب",
              Description: "فاصل (تسلسل) أو قالب مع {{inputN}} (استبدال)",
            },
          },
        },
      },
    ],
    i18n: {
      en: {
        category: "Text",
        title: "Join",
        nodeType: "Join",
        description:
          "Combines multiple text inputs. In Concatenate mode, joins them with a separator. In Substitute mode, replaces {{input1}}, {{input2}}, … placeholders inside a template.",
      },
      ar: {
        category: "نص",
        title: "دمج",
        nodeType: "دمج",
        description:
          "يدمج عدة مدخلات نصية. في وضع التسلسل يضمها بفاصل. في وضع الاستبدال يحل {{input1}}، {{input2}}، … في قالب نصي.",
      },
    },
  };

  function createJoinNode(id: number, position: Position): JoinNode {
    const inputCount = DEFAULT_INPUT_COUNT;

    return {
      id,
      category: metadata.category,
      title: metadata.title,
      nodeValue: metadata.nodeValue,
      nodeType: metadata.nodeType,
      sockets: buildSockets(id, inputCount),
      x: position.x,
      y: position.y,
      width: metadata.width,
      height: computeHeight(inputCount),
      selected: false,
      processing: false,
      process: async (context: NodeExecutionContext) => {
        const n = context.node as JoinNode;

        // Read Mode
        const modeParam = (n.configParameters ?? []).find(
          (p) => p.parameterName === "Mode"
        );
        const mode = String(
          modeParam?.paramValue ?? modeParam?.defaultValue ?? "concatenate"
        );

        // Read Separator / Template
        const separatorParam = (n.configParameters ?? []).find(
          (p) => p.parameterName === "Separator"
        );
        const rawValue = String(
          separatorParam?.paramValue ?? separatorParam?.defaultValue ?? " "
        );

        // Read Input Count
        const countParam = (n.configParameters ?? []).find(
          (p) => p.parameterName === "Input Count"
        );
        const parsed = Number(
          countParam?.paramValue ?? countParam?.defaultValue ?? DEFAULT_INPUT_COUNT
        );
        const inputCountVal = Math.min(
          7,
          Math.max(
            1,
            Number.isFinite(parsed) ? Math.trunc(parsed) : DEFAULT_INPUT_COUNT
          )
        );

        // Collect input values in socket order
        const inputValues: string[] = [];
        for (let i = 1; i <= inputCountVal; i++) {
          const socketId = n.id * 100 + i;
          const val = context.inputs[socketId];
          inputValues.push(
            val !== undefined && val !== null ? String(val) : ""
          );
        }

        if (mode === "substitute") {
          // Replace {{input1}}, {{input2}}, … in the template
          let result = rawValue;
          for (let i = 0; i < inputValues.length; i++) {
            const placeholder = new RegExp(`\\{\\{input${i + 1}\\}\\}`, "g");
            const replacement = inputValues[i] ?? "";
            result = result.replace(placeholder, () => replacement);
          }
          return result;
        } else {
          // Concatenate mode
          const separator = rawValue
            .replace(/\(new line\)/g, "\n")
            .replace(/\\n/g, "\n");
          return inputValues.filter((v) => v !== "").join(separator);
        }
      },

      configParameters: metadata.configParameters,

      getConfigParameters: function (): ConfigParameterType[] {
        return this.configParameters || [];
      },
      getConfigParameter(parameterName) {
        return (this.configParameters ?? []).find(
          (param) => param.parameterName === parameterName
        );
      },
      setConfigParameter(parameterName, value, onSocketsChanged?) {
        const parameter = (this.configParameters ?? []).find(
          (param) => param.parameterName === parameterName
        );
        if (!parameter) return;

        if (parameterName === "Input Count") {
          const parsed = Number(value);
          const newCount = Math.min(
            7,
            Math.max(1, Number.isFinite(parsed) ? Math.trunc(parsed) : DEFAULT_INPUT_COUNT)
          );
          
          const oldInputCount = this.sockets
            .filter(s => s.type === "input")
            .length;
          
          parameter.paramValue = newCount;
          this.sockets = buildSockets(this.id, newCount);
          this.height = computeHeight(newCount);
          
          if (newCount < oldInputCount && onSocketsChanged) {
            const removedSocketIds: number[] = [];
            for (let i = newCount + 1; i <= oldInputCount; i++) {
              removedSocketIds.push(this.id * 100 + i);
            }
            onSocketsChanged(removedSocketIds);
          }
        } else {
          parameter.paramValue = value;
        }
      },
    };
  }

  nodeRegistry.registerNodeType("Join", createJoinNode, metadata);
}
