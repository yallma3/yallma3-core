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
  Position,
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  NodeMetadata,
  DataType,
} from "../types/types";
import { NodeRegistry } from "../NodeRegistry";

export type OperationType = "extract_field" | "template_substitute";
export type OutputFormat  = "string" | "array" | "object" | "count";

export interface OperationConfig {
  id: string;
  type: OperationType;
  label: string;
  fieldPath?: string;
  outputFormat?: OutputFormat;
  template?: string;
}
const INPUT_SOCKET_OFFSET  = 1;  
const STATUS_SOCKET_OFFSET = 99; 
const OUTPUT_BASE          = 10;

export function opSocketId(nodeId: number, opIndex: number): number {
  return nodeId * 100 + OUTPUT_BASE + opIndex;
}

function buildSockets(id: number, ops: OperationConfig[]): BaseNode["sockets"] {
  const sockets: BaseNode["sockets"] = [
    {
      id: id * 100 + INPUT_SOCKET_OFFSET,
      title: "JSON Input",
      type: "input",
      nodeId: id,
      dataType: "string" as DataType,
    },
  ];
  ops.forEach((op, idx) => {
    sockets.push({
      id: opSocketId(id, idx),
      title: op.label || `Output ${idx + 1}`,
      type: "output",
      nodeId: id,
      dataType: "string" as DataType,
    });
  });
  sockets.push({
    id: id * 100 + STATUS_SOCKET_OFFSET,
    title: "Status",
    type: "output",
    nodeId: id,
    dataType: "string" as DataType,
  });
  return sockets;
}

function computeHeight(opCount: number): number {
  const totalSockets = opCount + 2;
  return Math.max(220, 100 + totalSockets * 50);
}

const DEFAULT_OPERATIONS: OperationConfig[] = [
  {
    id: "op_1",
    type: "extract_field",
    label: "Field Output",
    fieldPath: "title",
    outputFormat: "string",
  },
];

const DEFAULT_OPS_JSON = JSON.stringify(DEFAULT_OPERATIONS);

function getNestedValue(obj: unknown, path: string): unknown {
  const tokens = path.match(/[^.[\]]+|\[\d+\]/g) ?? [];

  return tokens.reduce((current: unknown, token) => {
    if (current === null || current === undefined) return undefined;
    const indexMatch = token.match(/^\[(\d+)\]$/);
    if (indexMatch && indexMatch[1]) {
      const index = parseInt(indexMatch[1], 10);
      return Array.isArray(current) ? current[index] : undefined;
    }
    if (typeof current === "object" && !Array.isArray(current)) {
      return (current as Record<string, unknown>)[token];
    }

    return undefined;
  }, obj);
}

function extractField(data: unknown, fieldPath: string): unknown {
  if (Array.isArray(data)) {
    return data
      .map((item) => getNestedValue(item, fieldPath))
      .filter((v) => v !== undefined);
  }
  return getNestedValue(data, fieldPath);
}

function formatOutput(value: unknown, fmt: OutputFormat): string {
  switch (fmt) {
    case "string":  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
    case "array":   return JSON.stringify(Array.isArray(value) ? value : [value], null, 2);
    case "object":  return JSON.stringify(value, null, 2);
    case "count":   return String(Array.isArray(value) ? value.length : value !== undefined ? 1 : 0);
    default:        return String(value ?? "");
  }
}

function templateSubstitute(data: unknown, template: string): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const val = getNestedValue(data, path.trim());
    return val !== undefined && val !== null ? String(val) : "";
  });
}

function readOperations(node: BaseNode): OperationConfig[] {
  const param = (node.configParameters ?? []).find(
    (p) => p.parameterName === "Operations"
  );
  const raw = String(param?.paramValue ?? param?.defaultValue ?? "");
  try {
    const parsed = JSON.parse(raw) as OperationConfig[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch { /* fall through */ }
  return DEFAULT_OPERATIONS;
}
export interface JSONManipulatorNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "Text",
  title: "JSON Manipulator",
  nodeType: "JSONManipulator",
  description:
    "Multi-output JSON processor. Each output runs an independent operation " +
    "(extract_field or template_substitute) on the same JSON input.",
  nodeValue: "",
  sockets: [
    { title: "JSON Input",   type: "input",  dataType: "string" },
    { title: "Field Output", type: "output", dataType: "string" },
    { title: "Status",       type: "output", dataType: "string" },
  ],
  width: 280,
  height: computeHeight(DEFAULT_OPERATIONS.length),
  configParameters: [
    {
      parameterName: "Operations",
      parameterType: "text",
      defaultValue: DEFAULT_OPS_JSON,
      valueSource: "UserInput",
      UIConfigurable: false,
      description: "JSON array of OperationConfig objects — managed by the Node Edit Panel UI",
      isNodeBodyContent: false,
    },
  ],
  i18n: {
    en: {
      category: "Text",
      title: "JSON Manipulator",
      nodeType: "JSON Manipulator",
      description:
        "Multi-output JSON processor with extract_field and template_substitute operations.",
    },
    ar: {
      category: "نص",
      title: "معالج JSON",
      nodeType: "معالج JSON",
      description: "معالج JSON متعدد المخرجات.",
    },
  },
};

export function createJSONManipulatorNode(
  id: number,
  position: Position
): JSONManipulatorNode {
  const ops = DEFAULT_OPERATIONS.map((o) => ({ ...o }));

  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: "",
    nodeType: metadata.nodeType,
    sockets: buildSockets(id, ops),
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: computeHeight(ops.length),
    selected: false,
    processing: false,

    configParameters: [
      {
        parameterName: "Operations",
        parameterType: "text",
        defaultValue: DEFAULT_OPS_JSON,
        paramValue: DEFAULT_OPS_JSON,
        valueSource: "UserInput",
        UIConfigurable: false,
        description: "JSON array of OperationConfig objects — managed by the Node Edit Panel UI",
        isNodeBodyContent: false,
      },
    ],
    process: async (context: NodeExecutionContext) => {
      const n   = context.node as JSONManipulatorNode;
      const ops = readOperations(n);

      // Parse the incoming JSON input once
      const jsonInput = context.inputs[n.id * 100 + INPUT_SOCKET_OFFSET];
      let parsed: unknown;
      try {
        if (!jsonInput || typeof jsonInput !== "string")
          throw new Error("JSON input is required and must be a string");
        parsed = JSON.parse(jsonInput);
      } catch (e) {
        const err = `Error: ${e instanceof Error ? e.message : String(e)}`;
        const result: Record<number, string> = {};
        ops.forEach((_op, idx) => { result[opSocketId(n.id, idx)] = ""; });
        result[n.id * 100 + STATUS_SOCKET_OFFSET] = err;
        return result;
      }

      // Run each operation and write to its dedicated socket
      const result: Record<number, string> = {};
      ops.forEach((op, idx) => {
        try {
          let output = "";
          if (op.type === "extract_field") {
            const value = extractField(parsed, op.fieldPath ?? "");
            output = formatOutput(value, op.outputFormat ?? "string");
          } else if (op.type === "template_substitute") {
            output = templateSubstitute(parsed, op.template ?? "");
          }
          result[opSocketId(n.id, idx)] = output;
        } catch (err) {
          result[opSocketId(n.id, idx)] =
            `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      });

      // Write Status — summarise how many ops ran successfully
      const errorCount = Object.values(result).filter((v) => String(v).startsWith("Error:")).length;
      result[n.id * 100 + STATUS_SOCKET_OFFSET] =
        errorCount === 0
          ? `Success: ${ops.length} operation${ops.length === 1 ? "" : "s"} completed`
          : `Warning: ${errorCount} of ${ops.length} operation${ops.length === 1 ? "" : "s"} failed`;

      return result;
    },

    getConfigParameters(): ConfigParameterType[] {
      return this.configParameters || [];
    },
    getConfigParameter(parameterName: string): ConfigParameterType | undefined {
      return (this.configParameters ?? []).find((p) => p.parameterName === parameterName);
    },
    setConfigParameter(parameterName: string, value: string | number | boolean): void {
      const param = (this.configParameters ?? []).find((p) => p.parameterName === parameterName);
      if (!param) return;
      param.paramValue = value;

      // When the panel writes a new "Operations" JSON → rebuild sockets + height immediately
      if (parameterName === "Operations") {
        try {
          const ops = JSON.parse(String(value)) as OperationConfig[];
          if (Array.isArray(ops)) {
            this.sockets = buildSockets(this.id, ops);
            this.height  = computeHeight(ops.length);
          }
        } catch { /* invalid JSON during typing — keep current sockets */ }
      }
    },
  };
}


export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType(
    metadata.nodeType,
    createJSONManipulatorNode,
    metadata
  );
}