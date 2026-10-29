import { describe, it, expect, beforeAll } from "vitest";
import { initFlowSystem } from "../../../Workflow/initFlowSystem";
import { createGoal2WorkflowPayload, createGoal2WorkspacePayload } from "../../__mocks__/goal2PayloadFixtures";
import { normalizeWorkflowPayload, normalizeWorkspacePayload } from "../../../Workflow/utils/normalizeWorkflow";
import type { Workflow } from "../../../Models/Workflow";
import type { WorkspaceData } from "../../../Models/Workspace";
import type { BaseNode } from "../../../Workflow/types/types";

describe("normalizeWorkflow utils", () => {
  beforeAll(() => {
    initFlowSystem();
  });

  describe("normalizeWorkflowPayload", () => {
    it("enriches missing category from nodeRegistry for Goal 2 payloads", () => {
      const raw = createGoal2WorkflowPayload() as unknown as Workflow;
      const normalized = normalizeWorkflowPayload(raw);

      expect(normalized.id).toBe("wf-goal2-demo");
      expect(normalized.nodes.length).toBe(2);

      const httpNode = normalized.nodes.find((n) => n.id === 1);
      expect(httpNode).toBeDefined();
      expect(httpNode?.nodeType).toBe("HttpCall");
      expect(httpNode?.category).toBe("Tools"); // Populated from metadata
      expect(httpNode?.title).toBe("Custom HTTP Request"); // Preserves custom title
      expect(httpNode?.x).toBe(0);
      expect(httpNode?.y).toBe(0);
    });

    it("preserves dynamic sockets and enriched configParameters", () => {
      const raw = createGoal2WorkflowPayload() as unknown as Workflow;
      const normalized = normalizeWorkflowPayload(raw);

      const joinNode = normalized.nodes.find((n) => n.id === 2);
      expect(joinNode).toBeDefined();
      expect(joinNode?.category).toBe("Text");
      expect(joinNode?.sockets.length).toBe(4);
      expect(joinNode?.sockets.map((s) => s.title)).toEqual([
        "Input 1",
        "Input 2",
        "Input 3",
        "Output",
      ]);

      const inputCountParam = joinNode?.configParameters?.find(
        (p) => p.parameterName === "Input Count"
      );
      expect(inputCountParam?.paramValue).toBe(3);
    });

    it("re-derives static sockets if sockets array is missing", () => {
      const minimalPayload: Workflow = {
        id: "wf-minimal",
        name: "Minimal Flow",
        description: "Flow with omitted sockets",
        nodes: [
          {
            id: 10,
            nodeType: "HttpCall",
            title: "HTTP Call",
          } as unknown as BaseNode,
        ],
        connections: [],
      };

      const normalized = normalizeWorkflowPayload(minimalPayload);
      const node = normalized.nodes[0]!;
      expect(node.category).toBe("Tools");
      expect(node.sockets).toBeDefined();
      expect(node.sockets.length).toBeGreaterThan(0);
      expect(node.sockets.some((s) => s.title === "URL")).toBe(true);
    });

    it("applies saved config parameters when re-deriving dynamic sockets for node omitting sockets", () => {
      const dynamicPayload: Workflow = {
        id: "wf-dynamic",
        name: "Dynamic Flow",
        description: "Flow with dynamic node omitting sockets",
        nodes: [
          {
            id: 20,
            nodeType: "Join",
            title: "Join Text",
            configParameters: [
              {
                parameterName: "Input Count",
                paramValue: 4,
              },
            ],
          } as unknown as BaseNode,
        ],
        connections: [],
      };

      const normalized = normalizeWorkflowPayload(dynamicPayload);
      const node = normalized.nodes[0]!;
      expect(node.sockets).toHaveLength(5); // 4 inputs + 1 output
      expect(node.sockets.map((s) => s.title)).toEqual([
        "Input 1",
        "Input 2",
        "Input 3",
        "Input 4",
        "Output",
      ]);
    });

    it("falls back gracefully for unknown node types without throwing", () => {
      const unknownPayload = {
        id: "wf-unknown",
        name: "Unknown Flow",
        description: "",
        nodes: [
          {
            id: 99,
            nodeType: "NonExistentNodeType",
            title: "Ghost",
          },
        ],
        connections: [],
      } as unknown as Workflow;

      const normalized = normalizeWorkflowPayload(unknownPayload);
      expect(normalized.nodes[0]!.category).toBe("Other");
      expect(normalized.nodes[0]!.x).toBe(0);
      expect(normalized.nodes[0]!.y).toBe(0);
    });
  });

  describe("normalizeWorkspacePayload", () => {
    it("normalizes all workflows embedded in a WorkspaceData object", () => {
      const rawWorkspace = createGoal2WorkspacePayload() as unknown as WorkspaceData;
      const normalized = normalizeWorkspacePayload(rawWorkspace);

      expect(normalized.workflows.length).toBe(1);
      const wf = normalized.workflows[0]!;
      expect(wf.nodes[0]!.category).toBe("Tools");
      expect(wf.nodes[1]!.category).toBe("Text");
    });

    it("handles workspace without workflows gracefully", () => {
      const emptyWorkspace = {
        id: "ws-empty",
        workflows: [],
      } as unknown as WorkspaceData;

      const normalized = normalizeWorkspacePayload(emptyWorkspace);
      expect(normalized.workflows).toEqual([]);
    });
  });
});
