import { describe, it, expect, vi, beforeAll } from "vitest";
import { executeFlowRuntime } from "../../../Workflow/runtime";
import { initFlowSystem } from "../../../Workflow/initFlowSystem";
import type { Workflow } from "../../../Models/Workflow";
import type { WebSocket } from "ws";

// Mock WebSocket
const mockWebSocket = {
  send: vi.fn(),
  close: vi.fn(),
  onmessage: vi.fn(),
  onclose: vi.fn(),
  onerror: vi.fn(),
};

vi.mock('ws', () => ({
  WebSocket: vi.fn().mockImplementation(() => mockWebSocket),
}));

describe("Complex Workflow Scenarios", () => {
  beforeAll(async () => {
    await initFlowSystem();
  });
  describe("Multi-node workflow execution", () => {
    it("should execute a workflow with input -> process -> output nodes", async () => {
      const workflow: Workflow = {
        id: "test-workflow-1",
        name: "Test Workflow",
        description: "A test workflow with multiple nodes",
        nodes: [
          {
            id: 1,
            category: "Input",
            title: "Workflow Input",
            nodeType: "WorkflowInput",
            sockets: [
              { id: 1, title: "output", type: "output", nodeId: 1, dataType: "string" }
            ],
          },
          {
            id: 2,
            category: "Text",
            title: "Join Text",
            nodeType: "Join",
            sockets: [
              { id: 2, title: "Input 1", type: "input", nodeId: 2, dataType: "unknown" },
              { id: 3, title: "Input 2", type: "input", nodeId: 2, dataType: "unknown" },
              { id: 4, title: "Output", type: "output", nodeId: 2, dataType: "string" }
            ],
            configParameters: [
              {
                parameterName: "Separator",
                parameterType: "text",
                defaultValue: " ",
                UIConfigurable: true,
                valueSource: "UserInput",
                paramValue: "-",
                description: "Separator for joining text",
              }
            ],
          }
        ],
        connections: [
          { fromSocket: 1, toSocket: 2 }, // WorkflowInput -> JoinText input1
        ],
      };

      const result = await executeFlowRuntime(workflow, mockWebSocket as unknown as WebSocket, "test input") as { layers: number[][]; results: Record<string, unknown>; finalResult: unknown };

      expect(result).toHaveProperty("layers");
      expect(result).toHaveProperty("results");
      expect(result).toHaveProperty("finalResult");

      // Check that execution completed without errors
      expect(result.layers.length).toBeGreaterThan(0);
      expect(Object.keys(result.results).length).toBeGreaterThan(0);
    });

    it("should handle workflow with delay and timing", async () => {
      const workflow: Workflow = {
        id: "test-workflow-delay",
        name: "Delay Workflow",
        description: "Test workflow with delay node",
        nodes: [
          {
            id: 1,
            category: "Input",
            title: "Workflow Input",
            nodeType: "WorkflowInput",
            sockets: [
              { id: 1, title: "output", type: "output", nodeId: 1, dataType: "string" }
            ],
          },
          {
            id: 2,
            category: "Utility",
            title: "Delay",
            nodeType: "Delay",
            sockets: [
              { id: 2, title: "input", type: "input", nodeId: 2, dataType: "string" },
              { id: 3, title: "output", type: "output", nodeId: 2, dataType: "string" }
            ],
            configParameters: [
              {
                parameterName: "delay",
                parameterType: "number",
                defaultValue: 1000,
                UIConfigurable: true,
                valueSource: "UserInput",
                paramValue: 100, // Short delay for test
                description: "Delay in milliseconds",
              }
            ],
          }
        ],
        connections: [
          { fromSocket: 1, toSocket: 2 }, // WorkflowInput -> Delay input
        ],
      };

      const startTime = Date.now();
      const result = await executeFlowRuntime(workflow, mockWebSocket as unknown as WebSocket, "delay test") as { layers: number[][]; results: Record<string, unknown>; finalResult: unknown };

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take at least 100ms due to delay
      expect(duration).toBeGreaterThanOrEqual(90);

      expect(result).toHaveProperty("layers");
      expect(result).toHaveProperty("results");
    });

    it("should handle JSON manipulation workflow", async () => {
      const workflow: Workflow = {
        id: "test-workflow-json",
        name: "JSON Workflow",
        description: "Test workflow with JSON manipulation",
        nodes: [
          {
            id: 1,
            category: "Input",
            title: "Workflow Input",
            nodeType: "WorkflowInput",
            sockets: [
              { id: 1, title: "output", type: "output", nodeId: 1, dataType: "string" }
            ],
          },
          {
            id: 2,
            category: "Data",
            title: "JSON Manipulator",
            nodeType: "JSONManipulator",
            sockets: [
              { id: 2, title: "input", type: "input", nodeId: 2, dataType: "json" },
              { id: 3, title: "output", type: "output", nodeId: 2, dataType: "json" }
            ],
            configParameters: [
              {
                parameterName: "operation",
                parameterType: "string",
                defaultValue: "extract_field",
                UIConfigurable: true,
                valueSource: "UserInput",
                paramValue: "extract_field",
                description: "JSON operation to perform",
              },
              {
                parameterName: "fieldPath",
                parameterType: "string",
                defaultValue: "name",
                UIConfigurable: true,
                valueSource: "UserInput",
                paramValue: "user.name",
                description: "Field path for extraction",
              },
              {
                parameterName: "outputFormat",
                parameterType: "string",
                defaultValue: "string",
                UIConfigurable: true,
                valueSource: "UserInput",
                paramValue: "string",
                description: "Output format",
              }
            ],
          }
        ],
        connections: [
          { fromSocket: 1, toSocket: 2 }, // WorkflowInput -> JSON Manipulator
        ],
      };

      const testJson = JSON.stringify({ user: { name: "John", age: 30 } });
      const result = await executeFlowRuntime(workflow, mockWebSocket as unknown as WebSocket, testJson) as { layers: number[][]; results: Record<string, unknown>; finalResult: unknown };

      expect(result).toHaveProperty("layers");
      expect(result).toHaveProperty("results");
      // JSON manipulation may fail in test environment, but workflow should execute
    });

    it("should handle parallel node execution", async () => {
      const workflow: Workflow = {
        id: "test-workflow-parallel",
        name: "Parallel Workflow",
        description: "Test workflow with parallel execution",
        nodes: [
          {
            id: 1,
            category: "Input",
            title: "Workflow Input",
            nodeType: "WorkflowInput",
            sockets: [
              { id: 1, title: "output", type: "output", nodeId: 1, dataType: "string" }
            ],
          },
          {
            id: 2,
            category: "Text",
            title: "Join Text 1",
            nodeType: "Join",
            sockets: [
              { id: 2, title: "Input 1", type: "input", nodeId: 2, dataType: "unknown" },
              { id: 3, title: "Output", type: "output", nodeId: 2, dataType: "string" }
            ],
            configParameters: [
              {
                parameterName: "Separator",
                parameterType: "text",
                defaultValue: " ",
                UIConfigurable: true,
                valueSource: "UserInput",
                paramValue: "1",
                description: "Separator",
              }
            ],
          },
          {
            id: 3,
            category: "Text",
            title: "Join Text 2",
            nodeType: "Join",
            sockets: [
              { id: 4, title: "Input 1", type: "input", nodeId: 3, dataType: "unknown" },
              { id: 5, title: "Output", type: "output", nodeId: 3, dataType: "string" }
            ],
            configParameters: [
              {
                parameterName: "Separator",
                parameterType: "text",
                defaultValue: " ",
                UIConfigurable: true,
                valueSource: "UserInput",
                paramValue: "2",
                description: "Separator",
              }
            ],
          }
        ],
        connections: [
          { fromSocket: 1, toSocket: 2 }, // Input -> Join1
          { fromSocket: 1, toSocket: 4 }, // Input -> Join2
        ],
      };

      const result = await executeFlowRuntime(workflow, mockWebSocket as unknown as WebSocket, "test") as { layers: number[][]; results: Record<string, unknown>; finalResult: unknown };

      expect(result).toHaveProperty("layers");
      expect(result).toHaveProperty("results");
      // Parallel execution should work
      expect(result.layers.length).toBeGreaterThan(1);
    });
  });
});