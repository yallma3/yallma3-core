import { describe, it, expect, vi, beforeEach } from "vitest";
import { workflowExecutor } from "../../../Agent/Utls/ToolCallingHelper";
import { FatalMainLLMError } from "../../../LLM/LLMRunner";
import { WorkspaceRepository } from "../../../Execution/WorkspaceRepository";
import type { ExecutionContext } from "../../../Execution/ExecutionContext";
import type { Workflow } from "../../../Models/Workflow";
import type { WorkspaceData } from "../../../Models/Workspace";

vi.mock("../../../Workflow/runtime", () => ({
  executeFlowRuntime: vi.fn(),
}));

import { executeFlowRuntime } from "../../../Workflow/runtime";

describe("ToolCallingHelper — workflowExecutor", () => {
  const mockCtx: ExecutionContext = {
    requestId: "req-wf-test",
    send: vi.fn(),
    onMessage: vi.fn(),
    onClose: vi.fn(() => () => {}),
    broadcast: vi.fn(),
  };

  const sampleWorkflow: Workflow = {
    id: "wf-123",
    name: "Sample Workflow",
    description: "test",
    nodes: [],
    connections: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const repo = WorkspaceRepository.getInstance();
    repo.set("ws-test", {
      id: "ws-test",
      name: "Test",
      workflows: [sampleWorkflow],
    } as unknown as WorkspaceData);
    repo.setCurrent("ws-test");
  });

  it("returns completed status with result on successful execution", async () => {
    vi.mocked(executeFlowRuntime).mockResolvedValueOnce({
      finalResult: "Success output",
    } as unknown as { finalResult: unknown });

    const res = await workflowExecutor(mockCtx, "wf-123");
    expect(res).toEqual({
      status: "completed",
      result: "Success output",
    });
  });

  it("returns failed status with error message for ordinary errors", async () => {
    vi.mocked(executeFlowRuntime).mockRejectedValueOnce(new Error("Network timeout"));

    const res = await workflowExecutor(mockCtx, "wf-123");
    expect(res).toEqual({
      status: "failed",
      reason: "Network timeout",
    });
  });

  it("re-throws FatalMainLLMError so caller fatal-stop handler triggers", async () => {
    const fatalErr = new FatalMainLLMError("Main LLM fatal breakdown");
    vi.mocked(executeFlowRuntime).mockRejectedValueOnce(fatalErr);

    await expect(workflowExecutor(mockCtx, "wf-123")).rejects.toThrow(FatalMainLLMError);
  });
});
