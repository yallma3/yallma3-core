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
 */

import type {
  BaseNode,
  NodeMetadata,
  Position,
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  DataType,
} from "../types/types";
import { nodeRegistry } from "../NodeRegistry";

interface IfElseNode extends BaseNode {
  nodeType: "IfElse";
}

const metadata: NodeMetadata = {
  nodeType: "IfElse",
  description: "A conditional logic gate that evaluates an input. If the condition is met, it outputs the 'True' value; otherwise, it outputs the 'False' value. Supports both strict boolean evaluation and general truthiness.",
  category: "Logic",
  title: "If/Else",
  nodeValue:"",
  sockets: [
    { title: "Condition", type: "input", dataType: "boolean" },
    { title: "True", type: "input", dataType: "unknown" },
    { title: "False", type: "input", dataType: "unknown" },
    { title: "Output", type: "output", dataType: "unknown" },
  ],
  width: 300,
  height: 240,
  configParameters: [
    {
      parameterName: "Strict Mode",
      parameterType: "boolean",
      defaultValue: false,
      valueSource: "UserInput",
      UIConfigurable: true,
      description:
        "If enabled, only exact `true` or `false` boolean values will be accepted as condition.",
      i18n: {
        en: {
          "Strict Mode": {
            Name: "Strict Mode",
            Description: "If enabled, only exact `true` or `false` boolean values will be accepted as condition.",
          },
        },
        ar: {
          "Strict Mode": {
            Name: "الوضع الصارم",
            Description: "إذا تم تفعيله، سيتم قبول القيم المنطقية `true` أو `false` فقط كشرط.",
          },
        },
      },
    },
  ],
  i18n: {
    en: {
      category: "Logic",
      title: "If/Else",
      nodeType: "If/Else",
      description: "A conditional logic gate that evaluates an input. If the condition is met, it outputs the 'True' value; otherwise, it outputs the 'False' value. Supports both strict boolean evaluation and general truthiness.",
    },
    ar: {
      category: "منطق",
      title: "إذا/وإلا",
      nodeType: "إذا/وإلا",
      description: "بوابة منطق شرطي تُقيّم إدخالاً. إذا تحقق الشرط، تُخرج القيمة 'صحيح'؛ وإلا تُخرج القيمة 'خطأ'. يدعم التقييم المنطقي الصارم والتقييم العام للصحة.",
    },
  },
};

function createIfElseNode(id: number, position: Position): IfElseNode {
  return {
    id,
    nodeType: "IfElse",
    category: metadata.category,
    title: metadata.title,
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    sockets: metadata.sockets.map((socket, index) => ({
      id: id * 100 + (socket.type === "input" ? index + 1 : index + 101),
      title: socket.title,
      type: socket.type,
      nodeId: id,
      dataType: socket.dataType as DataType,
    })),
    selected: false,
    processing: false,
    nodeValue: null,
    configParameters: metadata.configParameters,
    process: async (context: NodeExecutionContext) => {
      const n = context.node as IfElseNode;

      const condition = context.inputs[n.id * 100 + 1];
      const trueValue = context.inputs[n.id * 100 + 2];
      const falseValue = context.inputs[n.id * 100 + 3];

      const strictParam = n.getConfigParameter?.("Strict Mode");
      const strictMode = strictParam?.paramValue ?? false;

      let result: unknown;

      if (strictMode) {
        // only accept exact booleans
        result = condition === true ? trueValue : falseValue;
      } else {
        // general truthiness
       const isTruthy = (val: unknown): boolean => {
          if (val === undefined || val === null) return false;
          if (typeof val === "boolean") return val;
          if (typeof val === "string") return val.length > 0;
          if (Array.isArray(val)) return val.length > 0;
          if (typeof val === "object") return Object.keys(val).length > 0;
          return Boolean(val);
        };
        result = isTruthy(condition) ? trueValue : falseValue;
      }

      n.nodeValue = result as NodeValue;

      return {
        [n.id * 100 + 4]: result,
      };
    },
    getConfigParameters: function (): ConfigParameterType[] {
      return this.configParameters || [];
    },
    getConfigParameter: function (
      parameterName: string
    ): ConfigParameterType | undefined {
      return (this.configParameters || []).find(
        (param: ConfigParameterType) => param.parameterName === parameterName
      );
    },
    setConfigParameter: function (
      parameterName: string,
      value: string | number | boolean
    ): void {
      const parameter = (this.configParameters || []).find(
        (param: ConfigParameterType) => param.parameterName === parameterName
      );
      if (parameter) {
        parameter.paramValue = value;
      }
    },
  };
}

function register(): void {
  nodeRegistry.registerNodeType("IfElse", createIfElseNode, metadata);
}

export type { IfElseNode };
export { createIfElseNode, register };
