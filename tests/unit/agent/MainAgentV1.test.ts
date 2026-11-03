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
import { Yallma3GenOneAgentRuntime } from '../../../Agent/Agent';

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

describe('MainAgentV1 — Push-Back and Retries Protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(testLLMHealth).mockResolvedValue({ ok: true });
  });

  it('Branch A: re-runs upstream task when push-back specifies relatedTaskId and then completes dependent agent task', async () => {
    const { ctx, send } = makeContext();

    const wsWithUpstreamRetry: WorkspaceData = {
      ...mockWorkspaceData,
      maxIterations: 2,
      agents: [
        {
          id: 'agent-evaluator',
          name: 'Evaluator Agent',
          role: 'Evaluator',
          background: 'Code reviewer',
          systemPrompt: '',
          maxIterations: 2,
          tools: [],
        },
      ],
      workflows: [
        {
          id: 'wf-fetch',
          name: 'Fetch Workflow',
          description: '',
          nodes: [],
          connections: [],
        },
      ],
      tasks: [
        {
          id: 'task-wf',
          title: 'Workflow Fetch Task',
          type: 'workflow',
          description: 'Fetch external payload',
          systemPrompt: '',
          assignedAgent: null,
          executorId: 'wf-fetch',
          role: 'fetcher',
          expectedOutput: 'raw json',
        },
        {
          id: 'task-agent',
          title: 'Agent Review Task',
          type: 'specific-agent',
          description: 'Review fetched payload',
          systemPrompt: '',
          assignedAgent: null,
          executorId: 'agent-evaluator',
          role: 'evaluator',
          expectedOutput: 'reviewed output',
        },
      ],
      connections: [{ fromTask: 'task-wf', toTask: 'task-agent' }],
    };

    vi.mocked(getTaskExecutionOrderWithContext).mockReturnValue([
      { taskId: 'task-wf', context: [] },
      { taskId: 'task-agent', context: ['task-wf'] },
    ]);

    const { workflowExecutor } = await import('../../../Agent/Utls/ToolCallingHelper');
    // First run of workflow returns malformed data; second run returns valid data
    vi.mocked(workflowExecutor)
      .mockResolvedValueOnce({
        status: 'completed',
        result: 'Malformed incomplete response',
      })
      .mockResolvedValueOnce({
        status: 'completed',
        result: 'Valid complete response',
      });

    // Mock Yallma3GenOneAgentRuntime:
    // First run pushes back to upstream task-wf; second run accepts
    let runtimeRunCount = 0;
    const mockSetRetryContext = vi.fn();
    const mockSetAbortChecker = vi.fn();

    vi.mocked(Yallma3GenOneAgentRuntime).mockImplementation((() => {
      return {
        setRetryContext: mockSetRetryContext,
        setAbortChecker: mockSetAbortChecker,
        run: vi.fn(async () => {
          runtimeRunCount++;
          if (runtimeRunCount === 1) {
            return {
              output: 'Rejected malformed data',
              status: 'pushed_back',
              accepted: false,
              pushBack: {
                type: 'push_back',
                reason: 'Data was malformed and missing key fields',
                relatedTaskId: 'task-wf',
                relatedTaskTitle: 'Workflow Fetch Task',
              },
            };
          } else {
            return {
              output: 'Successfully evaluated valid response',
              status: 'completed',
              accepted: true,
            };
          }
        }),
      } as unknown as InstanceType<typeof Yallma3GenOneAgentRuntime>;
    }) as unknown as typeof Yallma3GenOneAgentRuntime);

    const agent = new MainAgentV1(wsWithUpstreamRetry, ctx);
    const results = await agent.run();

    // Both tasks ran twice
    expect(workflowExecutor).toHaveBeenCalledTimes(2);
    expect(runtimeRunCount).toBe(2);

    // Emitted retry info message
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message',
        data: expect.objectContaining({
          type: 'info',
          message: expect.stringContaining("Push-back received from task 'Agent Review Task': Re-running upstream task 'Workflow Fetch Task'"),
        }),
      })
    );

    // Final result contains agent output
    expect(results['task-agent']).toBe('Successfully evaluated valid response');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message',
        data: expect.objectContaining({
          type: 'success',
          message: 'Workspace completed successfully.',
        }),
      })
    );
  });

  it('Branch A: preserves and skips independent successful tasks during upstream push-back retry', async () => {
    const { ctx } = makeContext();

    const wsWithIndependentTask: WorkspaceData = {
      ...mockWorkspaceData,
      maxIterations: 3,
      workflows: [
        { id: 'wf-upstream', name: 'Upstream Workflow', nodes: [], connections: [] },
        { id: 'wf-independent', name: 'Independent Workflow', nodes: [], connections: [] },
      ],
      agents: [
        {
          id: 'agent-reviewer',
          name: 'Reviewer Agent',
          role: 'Reviewer',
          background: '',
          systemPrompt: '',
          maxIterations: 3,
          tools: [],
        },
      ],
      tasks: [
        {
          id: 'task-upstream',
          title: 'Upstream Task',
          type: 'workflow',
          description: '',
          systemPrompt: '',
          assignedAgent: null,
          executorId: 'wf-upstream',
          role: 'fetch',
          expectedOutput: 'data',
        },
        {
          id: 'task-independent',
          title: 'Independent Task',
          type: 'workflow',
          description: '',
          systemPrompt: '',
          assignedAgent: null,
          executorId: 'wf-independent',
          role: 'independent',
          expectedOutput: 'data',
        },
        {
          id: 'task-agent',
          title: 'Agent Review Task',
          type: 'specific-agent',
          description: '',
          systemPrompt: '',
          assignedAgent: null,
          executorId: 'agent-reviewer',
          role: 'review',
          expectedOutput: 'review',
        },
      ],
      connections: [
        { fromTask: 'task-upstream', toTask: 'task-agent' },
      ],
    };

    vi.mocked(getTaskExecutionOrderWithContext).mockReturnValue([
      { taskId: 'task-upstream', context: [] },
      { taskId: 'task-independent', context: [] },
      { taskId: 'task-agent', context: ['task-upstream'] },
    ]);

    const { workflowExecutor } = await import('../../../Agent/Utls/ToolCallingHelper');
    const wfCalls: string[] = [];
    vi.mocked(workflowExecutor).mockImplementation(async (_ctx, wfId) => {
      wfCalls.push(wfId);
      return {
        status: 'completed',
        result: `Result from ${wfId}`,
      };
    });

    let agentRunCount = 0;
    vi.mocked(Yallma3GenOneAgentRuntime).mockImplementation((() => {
      return {
        setRetryContext: vi.fn(),
        setAbortChecker: vi.fn(),
        run: vi.fn(async () => {
          agentRunCount++;
          if (agentRunCount === 1) {
            return {
              output: 'Need retry from upstream',
              status: 'pushed_back',
              accepted: false,
              pushBack: {
                type: 'push_back',
                reason: 'Need fresh data',
                relatedTaskId: 'task-upstream',
              },
            };
          } else {
            return {
              output: 'Done',
              status: 'completed',
              accepted: true,
            };
          }
        }),
      } as unknown as InstanceType<typeof Yallma3GenOneAgentRuntime>;
    }) as unknown as typeof Yallma3GenOneAgentRuntime);

    const agent = new MainAgentV1(wsWithIndependentTask, ctx);
    const results = await agent.run();

    // wf-upstream ran twice (initial + retry)
    expect(wfCalls.filter((id) => id === 'wf-upstream')).toHaveLength(2);
    // wf-independent ran ONLY ONCE (preserved, not invalidated)
    expect(wfCalls.filter((id) => id === 'wf-independent')).toHaveLength(1);
    // agent ran twice (pushed back, then completed)
    expect(agentRunCount).toBe(2);
    expect(results['task-agent']).toBe('Done');
    expect(results['task-independent']).toBe('Result from wf-independent');
  });

  it('Branch B: re-runs agent task with injected retryIteration and corrective suggestions when relatedTaskId is absent', async () => {
    const { ctx, send } = makeContext();

    const wsWithSelfRetry: WorkspaceData = {
      ...mockWorkspaceData,
      maxIterations: 2,
      agents: [
        {
          id: 'agent-writer',
          name: 'Writer Agent',
          role: 'Writer',
          background: 'Technical writer',
          systemPrompt: '',
          maxIterations: 2,
          tools: [],
        },
      ],
      tasks: [
        {
          id: 'task-draft',
          title: 'Drafting Task',
          type: 'specific-agent',
          description: 'Draft technical spec',
          systemPrompt: '',
          assignedAgent: null,
          executorId: 'agent-writer',
          role: 'writer',
          expectedOutput: 'full specification document',
        },
      ],
      connections: [],
    };

    vi.mocked(getTaskExecutionOrderWithContext).mockReturnValue([
      { taskId: 'task-draft', context: [] },
    ]);

    let runtimeRunCount = 0;
    const mockSetRetryContext = vi.fn();
    const mockSetAbortChecker = vi.fn();

    vi.mocked(Yallma3GenOneAgentRuntime).mockImplementation((() => {
      return {
        setRetryContext: mockSetRetryContext,
        setAbortChecker: mockSetAbortChecker,
        run: vi.fn(async () => {
          runtimeRunCount++;
          if (runtimeRunCount === 1) {
            return {
              output: 'Draft version 1 (incomplete)',
              status: 'pushed_back',
              accepted: false,
              pushBack: {
                type: 'push_back',
                reason: 'Document lacks architecture diagrams and security section',
                correctiveSuggestions: 'Include Mermaid architecture diagram and security considerations section.',
              },
            };
          } else {
            return {
              output: 'Draft version 2 (complete with architecture diagrams and security)',
              status: 'completed',
              accepted: true,
            };
          }
        }),
      } as unknown as InstanceType<typeof Yallma3GenOneAgentRuntime>;
    }) as unknown as typeof Yallma3GenOneAgentRuntime);

    const agent = new MainAgentV1(wsWithSelfRetry, ctx);
    const results = await agent.run();

    expect(runtimeRunCount).toBe(2);

    // On second attempt, setRetryContext was called with iteration 2 and the corrective suggestions
    expect(mockSetRetryContext).toHaveBeenCalledWith(
      2,
      'Include Mermaid architecture diagram and security considerations section.'
    );

    // Emitted info event about retrying with corrective guidance
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message',
        data: expect.objectContaining({
          type: 'info',
          message: expect.stringContaining("Push-back received for task 'Drafting Task': Retrying agent 'Writer Agent' with corrective guidance"),
        }),
      })
    );

    expect(results['task-draft']).toBe('Draft version 2 (complete with architecture diagrams and security)');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message',
        data: expect.objectContaining({
          type: 'success',
          message: 'Workspace completed successfully.',
        }),
      })
    );
  });

  it('Branch C: halts retries when budget is exhausted, marks task failed, cascades blocked status, and emits WORKSPACE_FAILED', async () => {
    const { ctx, send } = makeContext();

    const wsWithExhaustedBudget: WorkspaceData = {
      ...mockWorkspaceData,
      maxIterations: 1, // Only 1 retry allowed
      agents: [
        {
          id: 'agent-1',
          name: 'Agent 1',
          role: 'Analyst',
          background: '',
          systemPrompt: '',
          maxIterations: 1,
          tools: [],
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          role: 'Publisher',
          background: '',
          systemPrompt: '',
          maxIterations: 1,
          tools: [],
        },
      ],
      tasks: [
        {
          id: 'task-1',
          title: 'Initial Analysis',
          type: 'specific-agent',
          description: '',
          systemPrompt: '',
          assignedAgent: null,
          executorId: 'agent-1',
          role: 'analyst',
          expectedOutput: 'analysis',
        },
        {
          id: 'task-2',
          title: 'Downstream Publishing',
          type: 'specific-agent',
          description: '',
          systemPrompt: '',
          assignedAgent: null,
          executorId: 'agent-2',
          role: 'publisher',
          expectedOutput: 'published',
        },
      ],
      connections: [{ fromTask: 'task-1', toTask: 'task-2' }],
    };

    vi.mocked(getTaskExecutionOrderWithContext).mockReturnValue([
      { taskId: 'task-1', context: [] },
      { taskId: 'task-2', context: ['task-1'] },
    ]);

    let runCount = 0;
    vi.mocked(Yallma3GenOneAgentRuntime).mockImplementation((() => {
      return {
        setRetryContext: vi.fn(),
        setAbortChecker: vi.fn(),
        run: vi.fn(async () => {
          runCount++;
          // Always push back with internal defect
          return {
            output: `Persistent failure attempt ${runCount}`,
            status: 'pushed_back',
            accepted: false,
            pushBack: {
              type: 'push_back',
              reason: 'Persistent validation failure',
              correctiveSuggestions: 'Fix issue',
            },
          };
        }),
      } as unknown as InstanceType<typeof Yallma3GenOneAgentRuntime>;
    }) as unknown as typeof Yallma3GenOneAgentRuntime);

    const agent = new MainAgentV1(wsWithExhaustedBudget, ctx);
    const results = await agent.run();
    expect(results).toBeDefined();

    // Initial attempt + 1 retry = 2 attempts total
    expect(runCount).toBe(2);

    // Emits task failure due to retry limit exceeded
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        code: 'EXECUTION_ERROR',
        message: expect.stringContaining("Task 'Initial Analysis' failed: Push-back retry limit exceeded: Persistent validation failure"),
      })
    );

    // Downstream task 2 was skipped because task 1 failed
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message',
        data: expect.objectContaining({
          type: 'info',
          message: expect.stringContaining("Task 'Downstream Publishing' skipped"),
        }),
      })
    );

    // Terminal workspace failure emitted
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        code: 'WORKSPACE_FAILED',
        message: expect.stringContaining('Workspace execution failed: 1 task failed, 1 blocked.'),
      })
    );
  });
});
