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

type Operator =
  | "is_not_empty"
  | "is_empty"
  | "eq"
  | "neq"
  | "seq"
  | "sneq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "regex"
  | "between"
  | "is_null"
  | "is_number"
  | "is_string"
  | "is_boolean"
  | "is_array";

function isEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === "string") return val.trim().length === 0;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === "object") return Object.keys(val as object).length === 0;
  return false;
}

function toNum(val: unknown): number {
  if (typeof val === "number") return val;
  const n = Number(val);
  return isNaN(n) ? NaN : n;
}

function containsVal(haystack: unknown, needle: unknown): boolean {
  if (typeof haystack === "string") return haystack.includes(String(needle));
  if (Array.isArray(haystack)) return haystack.some((item) => item == needle);
  return false;
}

function evaluate(
  op: Operator,
  a: unknown,
  b: unknown,
  c: unknown,
  flags: string
): boolean {
  switch (op) {
    case "is_not_empty":  return !isEmpty(a);
    case "is_empty":      return isEmpty(a);
    case "is_null":       return a === null || a === undefined;
    case "is_number":     return typeof a === "number" && !isNaN(a as number);
    case "is_string":     return typeof a === "string";
    case "is_boolean":    return typeof a === "boolean";
    case "is_array":      return Array.isArray(a);
    case "eq":            return a == b;  
    case "neq":           return a != b; 
    case "seq":           return a === b;
    case "sneq":          return a !== b;
    case "gt":            return toNum(a) > toNum(b);
    case "gte":           return toNum(a) >= toNum(b);
    case "lt":            return toNum(a) < toNum(b);
    case "lte":           return toNum(a) <= toNum(b);
    case "between": {
      const n = toNum(a);
      return n >= toNum(b) && n <= toNum(c);
    }
    case "contains":      return containsVal(a, b);
    case "not_contains":  return !containsVal(a, b);
    case "starts_with":   return typeof a === "string" && a.startsWith(String(b));
    case "ends_with":     return typeof a === "string" && a.endsWith(String(b));
    case "regex": {
      try { return new RegExp(String(b), flags).test(String(a)); } catch { return false; }
    }
    default:              return !isEmpty(a);
  }
}

const metadata: NodeMetadata = {
  nodeType: "IfElse",
  description:
    "Evaluates a condition and routes data to the True or False output socket. " +
    "Only the matching output carries a value — the other output is undefined, " +
    "so downstream nodes on the non-matching branch will not execute.",
  category: "Logic",
  title: "If/Else",
  nodeValue:"",
  sockets: [
    { title: "Value to Check", type: "input",  dataType: "unknown" }, 
    { title: "Compare (B)",    type: "input",  dataType: "unknown" },
    { title: "Compare (C)",    type: "input",  dataType: "unknown" }, 
    { title: "True",           type: "output", dataType: "unknown" }, 
    { title: "False",          type: "output", dataType: "unknown" }, 
    { title: "Result",         type: "output", dataType: "boolean" }, 
  ],
  width: 300,
  height: 260,
  configParameters: [
    {
      parameterName: "Operator",
      parameterType: "string",
      defaultValue: "is_not_empty",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "The condition to evaluate.",
      sourceList: [
        { key: "is_not_empty",  label: "Is Not Empty" },
        { key: "is_empty",      label: "Is Empty / Null" },
        { key: "is_null",       label: "Is Null / Undefined" },
        { key: "is_number",     label: "Is a Number" },
        { key: "is_string",     label: "Is a String" },
        { key: "is_boolean",    label: "Is a Boolean" },
        { key: "is_array",      label: "Is an Array" },
        { key: "eq",            label: "== (Loose Equal)" },
        { key: "neq",           label: "!= (Loose Not Equal)" },
        { key: "seq",           label: "=== (Strict Equal)" },
        { key: "sneq",          label: "!== (Strict Not Equal)" },
        { key: "gt",            label: "> (Greater Than)" },
        { key: "gte",           label: ">= (Greater or Equal)" },
        { key: "lt",            label: "< (Less Than)" },
        { key: "lte",           label: "<= (Less or Equal)" },
        { key: "between",       label: "Between (B ≤ A ≤ C)" },
        { key: "contains",      label: "Contains" },
        { key: "not_contains",  label: "Does Not Contain" },
        { key: "starts_with",   label: "Starts With" },
        { key: "ends_with",     label: "Ends With" },
        { key: "regex",         label: "Matches Regex" },
      ],
      i18n: {
        en: { Operator: { Name: "Operator", Description: "The condition to evaluate." } },
        ar: { Operator: { Name: "المشغّل",  Description: "الشرط المراد تقييمه." } },
      },
    },
    {
      parameterName: "Compare B (literal)",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: false,
      description: "Literal value for B when the B socket is not connected.",
      i18n: {
        en: { "Compare B (literal)": { Name: "Compare B (literal)", Description: "Fallback literal for B." } },
        ar: { "Compare B (literal)": { Name: "قيمة B الحرفية", Description: "القيمة الاحتياطية لـ B." } },
      },
    },
    {
      parameterName: "Compare C (literal)",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: false,
      description: "Literal value for C when the C socket is not connected. Used by Between.",
      i18n: {
        en: { "Compare C (literal)": { Name: "Compare C (literal)", Description: "Fallback literal for C (Between only)." } },
        ar: { "Compare C (literal)": { Name: "قيمة C الحرفية", Description: "القيمة الاحتياطية لـ C." } },
      },
    },
    {
      parameterName: "Regex Flags",
      parameterType: "string",
      defaultValue: "i",
      valueSource: "UserInput",
      UIConfigurable: false,
      description: "Flags for the regex operator, e.g. 'i' = case-insensitive.",
      i18n: {
        en: { "Regex Flags": { Name: "Regex Flags", Description: "Flags for the Regex operator." } },
        ar: { "Regex Flags": { Name: "أعلام Regex", Description: "أعلام مشغّل التعبير النمطي." } },
      },
    },
    {
      parameterName: "Negate Result",
      parameterType: "boolean",
      defaultValue: false,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Flip the boolean result (NOT gate).",
      i18n: {
        en: { "Negate Result": { Name: "Negate Result", Description: "Flip the result (NOT gate)." } },
        ar: { "Negate Result": { Name: "نفي النتيجة", Description: "اعكس النتيجة." } },
      },
    },
  ],
  i18n: {
    en: {
      category: "Logic",
      title: "If/Else",
      nodeType: "If/Else",
      description: "Routes data to True or False output based on a condition. Only one output fires per execution.",
    },
    ar: {
      category: "منطق",
      title: "إذا/وإلا",
      nodeType: "إذا/وإلا",
      description: "يوجّه البيانات إلى مخرج صحيح أو خاطئ بناءً على شرط. مخرج واحد فقط يعمل في كل تنفيذ.",
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
    sockets: [
      { id: id * 100 + 1, title: "Value to Check", type: "input",  nodeId: id, dataType: "unknown" as DataType },
      { id: id * 100 + 2, title: "Compare (B)",    type: "input",  nodeId: id, dataType: "unknown" as DataType },
      { id: id * 100 + 3, title: "Compare (C)",    type: "input",  nodeId: id, dataType: "unknown" as DataType },
      { id: id * 100 + 101, title: "True",   type: "output", nodeId: id, dataType: "unknown" as DataType },
      { id: id * 100 + 102, title: "False",  type: "output", nodeId: id, dataType: "unknown" as DataType },
      { id: id * 100 + 103, title: "Result", type: "output", nodeId: id, dataType: "boolean" as DataType },
    ],
    selected: false,
    processing: false,
    nodeValue: null,
    configParameters: JSON.parse(JSON.stringify(metadata.configParameters)),
    process: async (context: NodeExecutionContext) => {
      const n    = context.node as IfElseNode;
      const base = n.id * 100;

      const a       = context.inputs[base + 1]; 
      const bSocket = context.inputs[base + 2]; 
      const cSocket = context.inputs[base + 3];

      const op         = (n.getConfigParameter?.("Operator")?.paramValue            ?? "is_not_empty") as Operator;
      const literalB   = String(n.getConfigParameter?.("Compare B (literal)")?.paramValue ?? "");
      const literalC   = String(n.getConfigParameter?.("Compare C (literal)")?.paramValue ?? "");
      const regexFlags = String(n.getConfigParameter?.("Regex Flags")?.paramValue         ?? "i");
      const negate     = Boolean(n.getConfigParameter?.("Negate Result")?.paramValue      ?? false);

      const b: unknown = (bSocket !== undefined && bSocket !== null) ? bSocket : literalB;
      const c: unknown = (cSocket !== undefined && cSocket !== null) ? cSocket : literalC;

      let condition = evaluate(op, a, b, c, regexFlags);
      if (negate) condition = !condition;

      const trueOutput:  unknown = condition ? a : undefined;
      const falseOutput: unknown = condition ? undefined : a;

      n.nodeValue = (condition ? trueOutput : falseOutput) as NodeValue;

      return {
        [base + 101]: trueOutput,   // True  output — has value only when condition is true
        [base + 102]: falseOutput,  // False output — has value only when condition is false
        [base + 103]: condition,    
      };
    },
    getConfigParameters: function (): ConfigParameterType[] {
      return this.configParameters || [];
    },
    getConfigParameter: function (parameterName: string): ConfigParameterType | undefined {
      return (this.configParameters || []).find(
        (p: ConfigParameterType) => p.parameterName === parameterName
      );
    },
    setConfigParameter: function (parameterName: string, value: string | number | boolean): void {
      const param = (this.configParameters || []).find(
        (p: ConfigParameterType) => p.parameterName === parameterName
      );
      if (param) param.paramValue = value;
    },
  };
}

function register(): void {
  nodeRegistry.registerNodeType("IfElse", createIfElseNode, metadata);
}

export type { IfElseNode };
export { createIfElseNode, register };
