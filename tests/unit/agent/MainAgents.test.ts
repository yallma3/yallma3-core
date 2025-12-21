import { describe, it, expect, vi } from 'vitest';
import { BasicAgentRuntime, yallma3GenSeqential } from '../../../Agent/MainAgents';
import type { WorkspaceData } from '../../../Models/Workspace';

// Mock dependencies
vi.mock('../../../LLM/LLMRunner', () => ({
  getLLMProvider: vi.fn(() => ({
    generateText: vi.fn().mockResolvedValue('Mock response'),
    supportsTools: false,
    registerTools: vi.fn(),
  })),
  runLLM: vi.fn(),
}));

vi.mock('../../../Agent/Agent', () => ({
  AgentRuntime: vi.fn(() => ({
    run: vi.fn().mockResolvedValue('Agent result'),
  })),
  Yallma3GenOneAgentRuntime: vi.fn(() => ({
    run: vi.fn().mockResolvedValue('Agent result'),
  })),
}));

vi.mock('../../../Workflow/runtime', () => ({
  executeFlowRuntime: vi.fn().mockResolvedValue({ finalResult: 'Workflow result' }),
}));

vi.mock('../../../Task/TaskGraph', () => ({
  getTaskExecutionOrderWithContext: vi.fn(() => [{ taskId: 'test-task', context: [] }]),
}));

vi.mock('../../../Task/TaskIntrepreter', () => ({
  analyzeTaskCore: vi.fn(() => ({
    taskId: 'test-task',
    intent: 'Test intent',
    classification: 'simple' as const,
    needsDecomposition: false,
    userInput: null,
  })),
  planAgenticTask: vi.fn(() => [{
    id: '1',
    action: 'Test action',
    rationale: 'Test reasoning',
    expectedOutput: 'Test outcome',
  }]),
}));

vi.mock('../../../Agent/Utls/MainAgentHelper', () => ({
  assignBestFit: vi.fn(() => ({
    type: 'agent' as const,
    id: 'test-agent',
    confidence: 0.9,
    reasoning: 'Test reasoning',
  })),
}));

vi.mock('../../../Agent/Utls/ToolCallingHelper', () => ({
  workflowExecutor: vi.fn().mockResolvedValue('Workflow result'),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('path', () => ({
  join: vi.fn(() => '/mock/path/result.txt'),
}));

const mockWorkspaceData: WorkspaceData = {
  id: 'test-workspace',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  name: 'Test Workspace',
  description: 'Test description',
  mainLLM: { provider: 'OpenAI', model: { name: 'gpt-3.5-turbo', id: 'gpt-3.5-turbo' } },
  apiKey: 'test-key',
  useSavedCredentials: false,
  tasks: [],
  connections: [],
  agents: [],
  workflows: [],
};

describe('MainAgents', () => {
  const mockWebSocket = {
    send: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  describe('BasicAgentRuntime', () => {
    it('should return early if workspaceData is not provided', async () => {
      await BasicAgentRuntime(null, mockWebSocket);
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });

    it('should execute successfully with valid workspace data', async () => {
      // Mock the LLM to return a valid plan
      const { runLLM } = await import('../../../LLM/LLMRunner');
      vi.mocked(runLLM).mockResolvedValueOnce(
        '{"project":{"name":"Test","objective":"Test"},"steps":[{"step":1,"task":"test-task","type":"agentic","agent":"test-agent","description":"Test"}]}'
      );

      await BasicAgentRuntime(mockWorkspaceData, mockWebSocket);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Creating Plan...')
      );
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Plan Created Successfully')
      );
    });
  });

  describe('yallma3GenSeqential', () => {
    it('should return early if workspaceData is not provided', async () => {
      const result = await yallma3GenSeqential(null, mockWebSocket);
      expect(result).toBeUndefined();
    });

    it('should execute successfully with valid workspace data', async () => {
      const result = await yallma3GenSeqential(mockWorkspaceData, mockWebSocket);

      expect(result).toBeDefined();
      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('completed successfully')
      );
    });
  });
});

