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
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  NodeMetadata,
  Position,
  DataType,
} from "../types/types";
import { NodeRegistry } from "../NodeRegistry";

export interface JSONManipulatorNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "Text",
  title: "JSON Manipulator",
  nodeType: "JSONManipulator",
  description: "A versatile node for processing JSON data. It can extract fields, filter arrays, transform structures, and count items based on configurable operations and field paths.",
  nodeValue: "JSON Processor",
  sockets: [
    { title: "JSON Input", type: "input", dataType: "string" },
    { title: "Result", type: "output", dataType: "string" },
    { title: "Status", type: "output", dataType: "string" },
  ],
  width: 320,
  height: 280,
  configParameters: [
    {
      parameterName: "Operation",
      parameterType: "string",
      defaultValue: "extract_field",
      valueSource: "UserInput",
      UIConfigurable: true,
      description:
        "Operation: extract_field, extract_array, filter, transform, count",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Field Path",
      parameterType: "string",
      defaultValue: "title",
      valueSource: "UserInput",
      UIConfigurable: true,
      description:
        "Field path to extract (e.g., 'title', 'data.name', 'items[0].id')",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Filter Condition",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description:
        "Filter condition (e.g., 'version > 1', 'title contains \"test\"')",
      isNodeBodyContent: false,
    },
    {
      parameterName: "Output Format",
      parameterType: "string",
      defaultValue: "array",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Output format: array, object, string, count",
      isNodeBodyContent: false,
    },
  ],
};

export function createJSONManipulatorNode(
  id: number,
  position: Position
): JSONManipulatorNode {
  return {
    id,
    category: metadata.category,
    title: metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType: metadata.nodeType,
    sockets: metadata.sockets.map((socket, index) => ({
      id: id * 100 + index + 1,
      title: socket.title,
      type: socket.type,
      nodeId: id,
      dataType: socket.dataType as DataType,
    })),
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    selected: false,
    processing: false,
    configParameters: [...metadata.configParameters],

    process: async (context: NodeExecutionContext) => {
      try {
        // Get input values
        const jsonInput = await context.inputs[id * 100 + 1];

        console.log(`Executing JSONManipulator node ${id}`);

        // Validate required inputs
        if (!jsonInput) {
          throw new Error("JSON input is required");
        }

        // Get configuration parameters
        const getConfigValue = (paramName: string) => {
          const param = context.node.configParameters?.find(
            (p: ConfigParameterType) => p.parameterName === paramName
          );
          return param?.paramValue ?? param?.defaultValue;
        };

        const operation = getConfigValue("Operation") as string;
        const fieldPath = getConfigValue("Field Path") as string;
        const filterCondition = getConfigValue("Filter Condition") as string;
        const outputFormat = getConfigValue("Output Format") as string;

        console.log(
          `Operation: ${operation}, Field Path: ${fieldPath}, Output Format: ${outputFormat}`
        );

        // Parse JSON input
        let jsonData: any;
        try {
          jsonData = JSON.parse(jsonInput);
        } catch (parseError) {
          throw new Error(
            `Invalid JSON input: ${
              parseError instanceof Error
                ? parseError.message
                : String(parseError)
            }`
          );
        }

        // Process based on operation
        let result: any;

        switch (operation.toLowerCase()) {
          case "extract_field":
            result = extractField(jsonData, fieldPath);
            break;
          case "extract_array":
            result = extractArrayField(jsonData, fieldPath);
            break;
          case "filter":
            result = filterData(jsonData, filterCondition);
            break;
          case "transform":
            result = transformData(jsonData, fieldPath);
            break;
          case "count":
            result = countItems(jsonData, fieldPath);
            break;
          default:
            throw new Error(`Unsupported operation: ${operation}`);
        }

        // Format output
        let formattedResult: string;
        switch (outputFormat.toLowerCase()) {
          case "array":
            formattedResult = JSON.stringify(
              Array.isArray(result) ? result : [result],
              null,
              2
            );
            break;
          case "object":
            formattedResult = JSON.stringify(result, null, 2);
            break;
          case "string":
            formattedResult = Array.isArray(result)
              ? result.join(", ")
              : String(result);
            break;
          case "count":
            formattedResult = String(Array.isArray(result) ? result.length : 1);
            break;
          default:
            formattedResult = JSON.stringify(result, null, 2);
        }

        console.log(`JSON manipulation completed successfully`);

        return {
          // Socket id 2 is for Result output
          [id * 100 + 2]: formattedResult,
          // Socket id 3 is for Status
          [id * 100 + 3]: `Success: ${operation} operation completed`,
        };
      } catch (error) {
        console.error("Error in JSONManipulator node:", error);

        return {
          [id * 100 + 2]: "",
          [id * 100 + 3]: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },

    getConfigParameters(): ConfigParameterType[] {
      return this.configParameters || [];
    },

    getConfigParameter(parameterName: string): ConfigParameterType | undefined {
      return (this.configParameters ?? []).find(
        (param: ConfigParameterType) => param.parameterName === parameterName
      );
    },

    setConfigParameter(
      parameterName: string,
      value: string | number | boolean
    ): void {
      const parameter = (this.configParameters ?? []).find(
        (param: ConfigParameterType) => param.parameterName === parameterName
      );
      if (parameter) {
        parameter.paramValue = value;
      }
    },
  };
}

// Helper functions for JSON manipulation

function extractField(data: any, fieldPath: string): any {
  if (Array.isArray(data)) {
    return data
      .map((item) => getNestedValue(item, fieldPath))
      .filter((val) => val !== undefined);
  } else {
    return getNestedValue(data, fieldPath);
  }
}

function extractArrayField(data: any, fieldPath: string): any[] {
  const result = extractField(data, fieldPath);
  return Array.isArray(result)
    ? result
    : [result].filter((val) => val !== undefined);
}

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((current, key) => {
    if (current === null || current === undefined) return undefined;

    // Handle array notation like items[0]
    const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch && arrayMatch[1] && arrayMatch[2]) {
      const arrayKey = arrayMatch[1];
      const index = arrayMatch[2];
      const array = current[arrayKey];
      return Array.isArray(array) ? array[parseInt(index, 10)] : undefined;
    }

    return current[key];
  }, obj);
}

function filterData(data: any, condition: string): any {
  if (!condition.trim()) return data;

  if (Array.isArray(data)) {
    return data.filter((item) => evaluateCondition(item, condition));
  } else {
    return evaluateCondition(data, condition) ? data : null;
  }
}

function evaluateCondition(item: any, condition: string): boolean {
  try {
    // Simple condition evaluation (extend as needed)
    // Supports: field > value, field < value, field == value, field contains "text"

    if (condition.includes(" contains ")) {
      const parts = condition.split(" contains ");
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const field = parts[0];
        const value = parts[1];
        const fieldValue = getNestedValue(item, field.trim());
        const searchValue = value.trim().replace(/['"]/g, "");
        return String(fieldValue)
          .toLowerCase()
          .includes(searchValue.toLowerCase());
      }
    }

    if (condition.includes(" > ")) {
      const parts = condition.split(" > ");
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const field = parts[0];
        const value = parts[1];
        const fieldValue = getNestedValue(item, field.trim());
        return Number(fieldValue) > Number(value.trim());
      }
    }

    if (condition.includes(" < ")) {
      const parts = condition.split(" < ");
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const field = parts[0];
        const value = parts[1];
        const fieldValue = getNestedValue(item, field.trim());
        return Number(fieldValue) < Number(value.trim());
      }
    }

    if (condition.includes(" == ")) {
      const parts = condition.split(" == ");
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const field = parts[0];
        const value = parts[1];
        const fieldValue = getNestedValue(item, field.trim());
        return String(fieldValue) === value.trim().replace(/['"]/g, "");
      }
    }

    return true;
  } catch {
    return false;
  }
}

function transformData(data: any, fieldPath: string): any {
  // Simple transformation - can be extended
  if (Array.isArray(data)) {
    return data.map((item) => {
      const value = getNestedValue(item, fieldPath);
      return { [fieldPath]: value };
    });
  } else {
    const value = getNestedValue(data, fieldPath);
    return { [fieldPath]: value };
  }
}

function countItems(data: any, fieldPath?: string): number {
  if (fieldPath) {
    const extracted = extractField(data, fieldPath);
    return Array.isArray(extracted)
      ? extracted.length
      : extracted !== undefined
      ? 1
      : 0;
  }

  return Array.isArray(data) ? data.length : 1;
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType(
    metadata.nodeType,
    createJSONManipulatorNode,
    metadata
  );
}
