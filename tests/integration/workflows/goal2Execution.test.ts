import { describe, it, expect, beforeAll, vi } from "vitest";
import { initFlowSystem } from "../../../Workflow/initFlowSystem";
import { createGoal2WorkflowPayload } from "../../__mocks__/goal2PayloadFixtures";
import { executeFlowRuntime } from "../../../Workflow/runtime";
import { normalizeWorkflowPayload } from "../../../Workflow/utils/normalizeWorkflow";
import type { ExecutionContext } from "../../../Execution/ExecutionContext";
import type { Workflow } from "../../../Models/Workflow";

describe("Goal 2 Workflow Execution Integration", () => {
  beforeAll(() => {
    initFlowSystem();
  });

  const mockCtx = {
    requestId: "req-goal2",
    send: vi.fn(),
    onMessage: vi.fn(),
    onClose: vi.fn(() => () => {}),
    broadcast: vi.fn(),
  } as unknown as ExecutionContext;

  it("executes a normalized Goal 2 workflow with dynamic Join node", async () => {
    const rawGoal2 = createGoal2WorkflowPayload() as unknown as Workflow;
    const normalized = normalizeWorkflowPayload(rawGoal2);

    const result = await executeFlowRuntime(normalized, mockCtx);

    expect(result).not.toBeInstanceOf(Error);
    if (!(result instanceof Error)) {
      expect(result.layers).toBeDefined();
      expect(result.layers.length).toBeGreaterThan(0);
      expect(result.results).toBeDefined();
    }
  });
});
