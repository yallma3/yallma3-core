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
    expect(result).toEqual({ __meta__: expect.any(String) });

    // No startup error emitted
    expect(send).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });
});
