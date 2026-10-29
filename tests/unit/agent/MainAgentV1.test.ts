import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionContext } from '../../../Execution/ExecutionContext';
import type { WorkspaceData } from '../../../Models/Workspace';

// Mock dependencies (mirrors tests/unit/agent/MainAgents.test.ts)
vi.mock('../../../LLM/LLMRunner', () => ({
  getLLMProvider: vi.fn(() => ({
    generateText: vi.fn().mockResolvedValue('Mock response'),
    supportsTools: false,
    registerTools: vi.fn(),
  })),
  runLLM: vi.fn(),
  testLLMHealth: vi.fn(),
}));

vi.mock('../../../Workflow/runtime', () => ({
  executeFlowRuntime: vi.fn().mockResolvedValue({ finalResult: 'Workflow result' }),
  requestStop: vi.fn(),
}));

vi.mock('../../../Task/TaskGraph', () => ({
  getTaskExecutionOrderWithContext: vi.fn(() => []),
}));

vi.mock('../../../Task/TaskIntrepreter', () => ({
  analyzeTaskCore: vi.fn(),
  planAgenticTask: vi.fn(() => []),
}));

vi.mock('../../../Agent/Utls/MainAgentHelper', () => ({
  assignBestFit: vi.fn(),
}));

vi.mock('../../../Agent/Utls/ToolCallingHelper', () => ({
  workflowExecutor: vi.fn(),
}));

vi.mock('../../../Agent/Agent', () => ({
  AgentRuntime: vi.fn(),
  Yallma3GenOneAgentRuntime: vi.fn(),
}));

vi.mock('../../../Agent/Validation/WorkspaceValidator', () => ({
  validateWorkspace: vi.fn(() => ({ valid: true })),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { MainAgentV1 } from '../../../Agent/Main/Versions/MainAgentV1';
import { testLLMHealth } from '../../../LLM/LLMRunner';
import { getTaskExecutionOrderWithContext } from '../../../Task/TaskGraph';

const mockWorkspaceData: WorkspaceData = {
  id: 'test-workspace',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  name: 'Test Workspace',
  description: 'Test description',
  mainLLM: {
    provider: 'OpenAI',
    model: {
      id: 'gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      contextWindow: { input: 4096, output: 4096 },
    },
  },
  apiKey: 'test-key',
  useSavedCredentials: false,
  tasks: [],
  connections: [],
  agents: [],
  workflows: [],
};

interface TestAgent {
  aborted: boolean;
}

function makeContext() {
  const send = vi.fn(async () => {});
  const ctx: ExecutionContext = {
    requestId: 'req-1',
    send,
    onMessage: vi.fn(),
    onClose: vi.fn(() => () => {}),
    broadcast: vi.fn(),
  };
  return { ctx, send };
}

describe('MainAgentV1 — Startup Gate 1 (Main LLM health check)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks execution when the Main LLM is unreachable', async () => {
    vi.mocked(testLLMHealth).mockResolvedValue({ ok: false, error: 'bad api key' });
    const { ctx, send } = makeContext();

    const agent = new MainAgentV1(mockWorkspaceData, ctx);
    const result = await agent.run();

    // run() bails out before building task layers
    expect(result).toEqual({});
    expect(getTaskExecutionOrderWithContext).not.toHaveBeenCalled();

    // aborted flag set
    expect((agent as unknown as TestAgent).aborted).toBe(true);

    // emitErrorRaw called with showError = true → the underlying error surfaces in the message
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        message: expect.stringContaining('Main LLM unreachable at startup bad api key'),
      })
    );
  });

  it('proceeds to create task layers when the Main LLM is reachable', async () => {
    vi.mocked(testLLMHealth).mockResolvedValue({ ok: true });
    const { ctx, send } = makeContext();

    const agent = new MainAgentV1(mockWorkspaceData, ctx);
    const result = await agent.run();

    // Gate 1 passed → layers were built, execution completed
    expect(getTaskExecutionOrderWithContext).toHaveBeenCalledTimes(1);
    expect((agent as unknown as TestAgent).aborted).toBe(false);
    expect(testLLMHealth).toHaveBeenCalledWith(mockWorkspaceData.mainLLM, 'test-key');
    expect(result).toEqual({ __meta__: expect.any(String), __final__: expect.any(String) });

    // No startup error emitted
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });
});

describe('MainAgentV1 — Blocked Task Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips agent tasks that are marked as blocked by buildTaskContext without running them', async () => {
    vi.mocked(testLLMHealth).mockResolvedValue({ ok: true });
    const { ctx, send } = makeContext();

    const wsWithTasks: WorkspaceData = {
      ...mockWorkspaceData,
      workflows: [
        {
          id: 'wf-fail',
          name: 'Failing WF',
          description: '',
          nodes: [],
          connections: [],
        },
      ],
      tasks: [
        {
          id: 'task-wf',
          title: 'Workflow Task',
          type: 'workflow',
          description: 'Failing workflow',
          systemPrompt: '',
          assignedAgent: null,
          executorId: 'wf-fail',
          role: 'test',
          expectedOutput: 'output',
        },
        {
          id: 'task-agent',
          title: 'Agent Task',
          type: 'agentic',
          description: 'Agent task dependent on workflow',
          systemPrompt: '',
          assignedAgent: null,
          executorId: null,
          role: 'test',
          expectedOutput: 'output',
        },
      ],
      connections: [{ fromTask: 'task-wf', toTask: 'task-agent' }],
    };

    vi.mocked(getTaskExecutionOrderWithContext).mockReturnValue([
      { taskId: 'task-wf', context: [] },
      { taskId: 'task-agent', context: ['task-wf'] },
    ]);

    const { workflowExecutor } = await import('../../../Agent/Utls/ToolCallingHelper');
    vi.mocked(workflowExecutor).mockResolvedValue({
      status: 'failed',
      reason: 'Workflow execution failed',
    });

    const { assignBestFit } = await import('../../../Agent/Utls/MainAgentHelper');

    const agent = new MainAgentV1(wsWithTasks, ctx);
    const result = await agent.run();

    // Workflow failed, so dependent agent task should be marked blocked and skipped
    expect(result).toBeDefined();
    // Verify error was sent with detailed failure reason
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        code: 'EXECUTION_ERROR',
        message: expect.stringContaining("Task 'Workflow Task' failed: Workflow execution failed"),
      })
    );
    // assignBestFit should NEVER have been called for task-agent because it was skipped
    expect(assignBestFit).not.toHaveBeenCalled();
    // Verify info event was sent indicating task was skipped
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message',
        data: expect.objectContaining({
          type: 'info',
          message: expect.stringContaining("Task 'Agent Task' skipped"),
        }),
      })
    );
    // Verify terminal failure event was sent (never a false success)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        code: 'WORKSPACE_FAILED',
        message: expect.stringContaining('Workspace execution failed: 1 task failed, 1 blocked.'),
      })
    );
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'success',
          message: 'Workspace completed successfully.',
        }),
      })
    );
  });

  it('emits a warning event when workspace completes with partial failures', async () => {
    vi.mocked(testLLMHealth).mockResolvedValue({ ok: true });
    const { ctx, send } = makeContext();

    const wsWithTasks: WorkspaceData = {
      ...mockWorkspaceData,
      workflows: [
        { id: 'wf-1', name: 'WF 1', description: '', nodes: [], connections: [] },
        { id: 'wf-2', name: 'WF 2', description: '', nodes: [], connections: [] },
      ],
      tasks: [
        {
          id: 'task-1',
          title: 'Task 1',
          type: 'workflow',
          description: '',
          systemPrompt: '',
          assignedAgent: null,
          executorId: 'wf-1',
          role: 'test',
          expectedOutput: 'output',
        },
        {
          id: 'task-2',
          title: 'Task 2',
          type: 'workflow',
          description: '',
          systemPrompt: '',
          assignedAgent: null,
          executorId: 'wf-2',
          role: 'test',
          expectedOutput: 'output',
        },
      ],
      connections: [],
    };

    vi.mocked(getTaskExecutionOrderWithContext).mockReturnValue([
      { taskId: 'task-1', context: [] },
      { taskId: 'task-2', context: [] },
    ]);

    const { workflowExecutor } = await import('../../../Agent/Utls/ToolCallingHelper');
    vi.mocked(workflowExecutor)
      .mockResolvedValueOnce({
        status: 'completed',
        result: 'Success Result',
      })
      .mockResolvedValueOnce({
        status: 'failed',
        reason: 'Second WF failed',
      });

    const agent = new MainAgentV1(wsWithTasks, ctx);
    const result = await agent.run();

    expect(result).toBeDefined();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message',
        code: 'WORKSPACE_PARTIAL_SUCCESS',
        data: expect.objectContaining({
          type: 'warn',
          message: expect.stringContaining('Workspace execution finished with partial failures: 1 succeeded, 1 failed, 0 blocked.'),
        }),
      })
    );
  });

  it('marks unassignable task as failed and remaining tasks as blocked, emitting WORKSPACE_FAILED', async () => {
    vi.mocked(testLLMHealth).mockResolvedValue({ ok: true });
    const { ctx, send } = makeContext();

    vi.mocked(getTaskExecutionOrderWithContext).mockReturnValue([
      { taskId: 'task-orphan', context: [] },
      { taskId: 'task-subsequent', context: [] },
    ]);

    const { assignBestFit } = await import('../../../Agent/Utls/MainAgentHelper');
    vi.mocked(assignBestFit).mockResolvedValueOnce(null);

    const wsWithUnassignableTask: WorkspaceData = {
      ...mockWorkspaceData,
      tasks: [
        {
          id: 'task-orphan',
          title: 'Orphan Task',
          type: 'agentic',
          description: 'Cannot be assigned',
          systemPrompt: '',
          assignedAgent: null,
          role: 'test',
          expectedOutput: 'output',
        },
        {
          id: 'task-subsequent',
          title: 'Subsequent Task',
          type: 'agentic',
          description: 'Follow-up task',
          systemPrompt: '',
          assignedAgent: null,
          role: 'test',
          expectedOutput: 'output',
        },
      ],
    };

    const agent = new MainAgentV1(wsWithUnassignableTask, ctx);
    const result = await agent.run();

    expect(result).toBeDefined();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        code: 'WORKSPACE_FAILED',
        message: expect.stringContaining('Workspace execution failed: 1 task failed, 1 blocked.'),
      })
    );
  });
});
