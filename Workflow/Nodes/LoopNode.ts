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
  NodeMetadata,
  Position,
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  DataType,
} from "../types/types";
import { NodeRegistry } from "../NodeRegistry";

export interface LoopNode extends BaseNode {
  nodeType: "Loop";
  _loopIndex: number;
  _loopArray: unknown[] | null;
}
const resolvePath = (obj: unknown, path: string): unknown => {
  if (!path.trim()) return obj;
  const tokens = path.match(/[^.[\]]+|\[\d+\]/g) ?? [];
  return tokens.reduce((cur: unknown, token: string) => {
    if (cur === null || cur === undefined) return undefined;
    const idxMatch = token.match(/^\[(\d+)\]$/);
    if (idxMatch && idxMatch[1] !== undefined) {
      return Array.isArray(cur) ? cur[parseInt(idxMatch[1], 10)] : undefined;
    }
    if (typeof cur === "object" && !Array.isArray(cur)) {
      return (cur as Record<string, unknown>)[token];
    }
    return undefined;
  }, obj);
};

const toArray = (raw: unknown, fieldPath: string): unknown[] => {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { /* ignore parse errors */ }
  }
  const extracted = fieldPath.trim() ? resolvePath(parsed, fieldPath) : parsed;
  if (Array.isArray(extracted)) return extracted;
  if (extracted === null || extracted === undefined) return [];
  if (typeof extracted === "object") return Object.values(extracted as object);
  return [extracted];
};

const formatItem = (item: unknown, outputFormat: string): unknown => {
  if (outputFormat === "string") {
    return typeof item === "string" ? item : JSON.stringify(item);
  }
  return item;
};


export function register(nodeRegistry: NodeRegistry): void {

  const metadata: NodeMetadata = {
    nodeType: "Loop",
    description:
      "Iterates over an array and emits one item per execution via the Loop output. " +
      "Wire the Loop output back into your processing chain and connect its end back " +
      "to this node's input to advance to the next item. When all items have been " +
      "processed the Done output fires with the complete array. " +
      "Use Single Item mode to test with one item by index.",
    category: "Logic",
    title: "Loop",
    nodeValue: "",
    sockets: [
      { title: "Array Input",   type: "input",  dataType: "unknown" }, 
      { title: "Loop",          type: "output", dataType: "unknown" }, 
      { title: "Done",          type: "output", dataType: "unknown" }, 
      { title: "Current Index", type: "output", dataType: "number"  }, 
      { title: "Batch Size",    type: "output", dataType: "number"  }, 
    ],
    width: 300,
    height: 300,
    configParameters: [
      {
        parameterName: "Run Mode",
        parameterType: "string",
        defaultValue: "single",
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Single Item: emit one item by index (for testing). All Items: auto-advance through every item.",
        sourceList: [
          { key: "single", label: "Single Item" },
          { key: "all",    label: "All Items"   },
        ],
        i18n: {
          en: { "Run Mode": { Name: "Run Mode",    Description: "Single or full loop mode." } },
          ar: { "Run Mode": { Name: "وضع التشغيل", Description: "وضع عنصر واحد أو حلقة كاملة." } },
        },
      },
      {
        parameterName: "Field Path",
        parameterType: "string",
        defaultValue: "",
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Dot-notation path to the array within the input. Leave empty if input is already an array.",
        i18n: {
          en: { "Field Path": { Name: "Field Path",  Description: "Path to array within input JSON." } },
          ar: { "Field Path": { Name: "مسار الحقل", Description: "المسار إلى المصفوفة داخل JSON." } },
        },
      },
      {
        parameterName: "Output Format",
        parameterType: "string",
        defaultValue: "json",
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "json: emit items as-is (objects stay objects). string: stringify each item.",
        sourceList: [
          { key: "json",   label: "JSON (native)" },
          { key: "string", label: "Plain String"  },
        ],
        i18n: {
          en: { "Output Format": { Name: "Output Format",  Description: "How each item is emitted." } },
          ar: { "Output Format": { Name: "تنسيق الإخراج", Description: "كيفية إخراج كل عنصر." } },
        },
      },
      {
        parameterName: "Item Index",
        parameterType: "number",
        defaultValue: 0,
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Zero-based index of the item to emit in Single Item mode.",
        i18n: {
          en: { "Item Index": { Name: "Item Index",  Description: "Index of item to emit (0 = first)." } },
          ar: { "Item Index": { Name: "فهرس العنصر", Description: "فهرس العنصر (0 = الأول)." } },
        },
      },
      {
        parameterName: "Max Items",
        parameterType: "number",
        defaultValue: 0,
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Maximum number of items to process (0 = no limit).",
        i18n: {
          en: { "Max Items": { Name: "Max Items",            Description: "0 = process all." } },
          ar: { "Max Items": { Name: "الحد الأقصى للعناصر", Description: "0 = معالجة الكل." } },
        },
      },
      {
        parameterName: "Delay Between Items (ms)",
        parameterType: "number",
        defaultValue: 0,
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Milliseconds to wait between emitting each item. Useful to avoid rate-limits.",
        i18n: {
          en: { "Delay Between Items (ms)": { Name: "Delay Between Items (ms)",     Description: "Wait between items." } },
          ar: { "Delay Between Items (ms)": { Name: "التأخير بين العناصر (مللي ث)", Description: "انتظر بين العناصر." } },
        },
      },
      {
        parameterName: "Stop On Error",
        parameterType: "boolean",
        defaultValue: false,
        valueSource: "UserInput",
        UIConfigurable: true,
        description: "Stop the loop immediately when a downstream error occurs. Otherwise, skip and continue.",
        i18n: {
          en: { "Stop On Error": { Name: "Stop On Error",   Description: "Halt loop on first error." } },
          ar: { "Stop On Error": { Name: "توقف عند الخطأ", Description: "أوقف الحلقة عند أول خطأ." } },
        },
      },
    ],
    i18n: {
      en: {
        category: "Logic",
        title: "Loop",
        nodeType: "Loop",
        description: "Iterates over an array item by item, routing each through the Loop output and signalling Done when finished.",
      },
      ar: {
        category: "منطق",
        title: "حلقة",
        nodeType: "حلقة",
        description: "يكرر على مصفوفة عنصرًا تلو الآخر، يوجه كل عنصر عبر مخرج Loop ويُشير بـ Done عند الانتهاء.",
      },
    },
  };

  function createLoopNode(id: number, position: Position): LoopNode {
    const base = id * 100;

    return {
      id,
      nodeType: "Loop",
      category: metadata.category,
      title: metadata.title,
      nodeValue: null,
      x: position.x,
      y: position.y,
      width: metadata.width,
      height: metadata.height,
      selected: false,
      processing: false,
      configParameters: JSON.parse(JSON.stringify(metadata.configParameters)),

      _loopIndex: 0,
      _loopArray: null,

      sockets: [
        { id: base + 1,   title: "Array Input",   type: "input",  nodeId: id, dataType: "unknown" as DataType },
        { id: base + 101, title: "Loop",           type: "output", nodeId: id, dataType: "unknown" as DataType },
        { id: base + 102, title: "Done",           type: "output", nodeId: id, dataType: "unknown" as DataType },
        { id: base + 103, title: "Current Index",  type: "output", nodeId: id, dataType: "number"  as DataType },
        { id: base + 104, title: "Batch Size",     type: "output", nodeId: id, dataType: "number"  as DataType },
      ],

      process: async (context: NodeExecutionContext) => {
        const n    = context.node as LoopNode;
        const base = n.id * 100;
        const runMode   = String(n.getConfigParameter?.("Run Mode")?.paramValue                 ?? "single");
        const fieldPath = String(n.getConfigParameter?.("Field Path")?.paramValue               ?? "");
        const outputFmt = String(n.getConfigParameter?.("Output Format")?.paramValue            ?? "json");
        const itemIndex = Number(n.getConfigParameter?.("Item Index")?.paramValue               ?? 0);
        const maxItems  = Number(n.getConfigParameter?.("Max Items")?.paramValue                ?? 0);
        const delayMs   = Number(n.getConfigParameter?.("Delay Between Items (ms)")?.paramValue ?? 0);
        const rawInput = context.inputs[base + 1];

        if (runMode === "single") {
          const arr   = toArray(rawInput, fieldPath);
          const total = arr.length;

          if (total === 0) {
            n.nodeValue = null;
            return {
              [base + 101]: undefined,
              [base + 102]: arr,
              [base + 103]: 0,
              [base + 104]: 0,
            };
          }

          const idx  = Math.max(0, Math.min(itemIndex, total - 1));
          const item = formatItem(arr[idx], outputFmt);
          n.nodeValue = item as NodeValue;

          return {
            [base + 101]: item,     
            [base + 102]: undefined, 
            [base + 103]: idx,
            [base + 104]: total,
          };
        }

        if (n._loopArray === null) {
          let arr = toArray(rawInput, fieldPath);
          if (maxItems > 0 && arr.length > maxItems) arr = arr.slice(0, maxItems);
          n._loopArray = arr;
          n._loopIndex = 0;
        }

        const arr   = n._loopArray;
        const total = arr.length;

        if (n._loopIndex >= total) {
          const donePayload = arr;
          n._loopArray = null;
          n._loopIndex = 0;
          n.nodeValue  = null;

          return {
            [base + 101]: undefined,
            [base + 102]: donePayload,
            [base + 103]: total,
            [base + 104]: total,
          };
        }

        if (n._loopIndex > 0 && delayMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        }

        const currentIdx = n._loopIndex;
        const item       = formatItem(arr[currentIdx], outputFmt);
        n._loopIndex    += 1;
        n.nodeValue      = item as NodeValue;

        return {
          [base + 101]: item,      
          [base + 102]: undefined, 
          [base + 103]: currentIdx,
          [base + 104]: total,
        };
      },

      getConfigParameters: function (): ConfigParameterType[] {
        return this.configParameters || [];
      },
      getConfigParameter: function (parameterName: string): ConfigParameterType | undefined {
        return (this.configParameters ?? []).find(
          (param: ConfigParameterType) => param.parameterName === parameterName
        );
      },
      setConfigParameter: function (parameterName: string, value: string | number | boolean): void {
        const param = (this.configParameters ?? []).find(
          (p: ConfigParameterType) => p.parameterName === parameterName
        );
        if (param) param.paramValue = value;
      },
    };
  }

  nodeRegistry.registerNodeType("Loop", createLoopNode, metadata);
}