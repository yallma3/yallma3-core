import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import { AgentRuntime, Yallma3GenOneAgentRuntime } from '../../../Agent/Agent';
import type { Agent } from '../../../Models/Agent';
import type { Task, AgentStep } from '../../../Models/Task';
import type { LLMProvider, LLMOption } from '../../../Models/LLM';

// Mock dependencies
vi.mock('../../../LLM/LLMRunner', () => ({
  getLLMProvider: vi.fn(),
}));

vi.mock('../../../Agent/Utls/ToolCallingHelper', () => ({
  toolExecutorAttacher: vi.fn(),
}));

vi.mock('../../../Agent/Utls/McpUtils', () => ({
  closeMcpConnections: vi.fn(),
}));

import { getLLMProvider } from '../../../LLM/LLMRunner';
import { toolExecutorAttacher } from '../../../Agent/Utls/ToolCallingHelper';
import { closeMcpConnections } from '../../../Agent/Utls/McpUtils';

describe('AgentRuntime', () => {
  let mockLLM: LLMProvider;
  let mockAgent: Agent;
  let mockTask: Task;
  let mockGetLLMProvider: MockedFunction<typeof getLLMProvider>;

  beforeEach(() => {
    mockLLM = {
      generateText: vi.fn(),
      supportsTools: false,
      registerTools: vi.fn(),
    };

    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      role: 'Test Role',
      objective: 'Test objective',
      background: 'Test background',
      capabilities: 'Test capabilities',
      apiKey: 'test-key',
      llm: { provider: 'OpenAI' as const, model: { name: 'GPT-4', id: 'gpt-4' } },
      tools: [],
    };

    mockTask = {
      id: 'test-task',
      title: 'Test Task',
      description: 'A test task',
      expectedOutput: 'Test output format',
      type: 'test',
      executorId: 'test-executor',
      position: '0,0',
      selected: false,
      sockets: [],
    };

    mockGetLLMProvider = vi.mocked(getLLMProvider);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetLLMProvider.mockReturnValue(mockLLM as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with agent, task, and context', () => {
      new AgentRuntime(mockAgent, mockTask, 'test context');

      expect(mockGetLLMProvider).toHaveBeenCalledWith(
        mockAgent.llm,
        mockAgent.apiKey
      );
    });

    it('should use workspace key when agent has no apiKey', () => {
      const agentWithoutKey = { ...mockAgent, apiKey: '' };
      const workspaceKey = 'workspace-key';

      new AgentRuntime(agentWithoutKey, mockTask, 'test context', workspaceKey);

      expect(mockGetLLMProvider).toHaveBeenCalledWith(
        mockAgent.llm,
        workspaceKey
      );
    });

    it('should use workspace LLM when agent has no llm', () => {
      const agentWithoutLLM = { ...mockAgent, llm: { provider: 'Groq' as const, model: { name: 'Llama2', id: 'llama2' } } };
      const workspaceLLM: LLMOption = { provider: 'Groq', model: { name: 'Llama2', id: 'llama2' } };

      new AgentRuntime(agentWithoutLLM, mockTask, 'test context', undefined, workspaceLLM);

      expect(mockGetLLMProvider).toHaveBeenCalledWith(
        workspaceLLM,
        mockAgent.apiKey
      );
    });
  });

  describe('run', () => {
    it('should complete task on first iteration when review passes', async () => {
      const mockLLMGenerate = vi.mocked(mockLLM.generateText);
      mockLLMGenerate
        .mockResolvedValueOnce('Agent response')
        .mockResolvedValueOnce(JSON.stringify({
          task_completion_status: 'complete',
          feedback: 'Good job',
        }));

      const runtime = new AgentRuntime(mockAgent, mockTask, 'test context');
      const result = await runtime.run();

      expect(result).toBe('Agent response');
      expect(mockLLMGenerate).toHaveBeenCalledTimes(2);
    });

    it('should iterate when review indicates needs revision', async () => {
      const mockLLMGenerate = vi.mocked(mockLLM.generateText);
      mockLLMGenerate
        .mockResolvedValueOnce('First response')
        .mockResolvedValueOnce(JSON.stringify({
          task_completion_status: 'needs_revision',
          feedback: 'Needs improvement',
        }))
        .mockResolvedValueOnce('Improved response')
        .mockResolvedValueOnce(JSON.stringify({
          task_completion_status: 'complete',
          feedback: 'Much better',
        }));

      const runtime = new AgentRuntime(mockAgent, mockTask, 'test context');
      const result = await runtime.run();

      expect(result).toBe('Improved response');
      expect(mockLLMGenerate).toHaveBeenCalledTimes(4);
    });

    it('should stop at max iterations', async () => {
      const mockLLMGenerate = vi.mocked(mockLLM.generateText);
      // Always return needs_revision for 6 iterations (max is 5)
      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) {
          mockLLMGenerate.mockResolvedValueOnce('Response ' + i);
        } else {
          mockLLMGenerate.mockResolvedValueOnce(JSON.stringify({
            task_completion_status: 'needs_revision',
            feedback: 'Keep trying',
          }));
        }
      }

      const runtime = new AgentRuntime(mockAgent, mockTask, 'test context');
      const result = await runtime.run();

      expect(result).toBe('Response 8'); // Last response before max iterations
      expect(mockLLMGenerate).toHaveBeenCalledTimes(10); // 5 responses + 5 reviews
    });
  });

  describe('buildPrompt', () => {
    it('should build initial prompt correctly', () => {
      const runtime = new AgentRuntime(mockAgent, mockTask, 'test context');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prompt = (runtime as any).buildPrompt(0, '', '');

      expect(prompt).toContain(`You are ${mockAgent.name}, a ${mockAgent.role}`);
      expect(prompt).toContain(`TASK: ${mockTask.title}`);
      expect(prompt).toContain(`DESCRIPTION: ${mockTask.description}`);
      expect(prompt).toContain('test context');
      expect(prompt).toContain(`EXPECTED OUTPUT FORMAT: ${mockTask.expectedOutput}`);
    });

    it('should build revision prompt correctly', () => {
      const runtime = new AgentRuntime(mockAgent, mockTask, 'test context');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prompt = (runtime as any).buildPrompt(1, 'previous result', 'feedback text');

      expect(prompt).toContain('improve your previous response');
      expect(prompt).toContain('previous result');
      expect(prompt).toContain('feedback text');
      expect(prompt).toContain('IMPROVEMENT INSTRUCTIONS');
    });
  });

  describe('buildReviewPrompt', () => {
    it('should build review prompt with task details', () => {
      const runtime = new AgentRuntime(mockAgent, mockTask, 'test context');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prompt = (runtime as any).buildReviewPrompt('test response');

      expect(prompt).toContain(`TASK NAME: ${mockTask.title}`);
      expect(prompt).toContain(`TASK DESCRIPTION: ${mockTask.description}`);
      expect(prompt).toContain(`EXPECTED OUTPUT: ${mockTask.expectedOutput}`);
      expect(prompt).toContain('test response');
      expect(prompt).toContain('task_completion_status');
    });
  });
});

describe('Yallma3GenOneAgentRuntime', () => {
  let mockLLM: LLMProvider;
  let mockAgent: Agent;
  let mockTask: Task;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockWebSocket: any;
  let mockGetLLMProvider: MockedFunction<typeof getLLMProvider>;
  let mockToolExecutorAttacher: MockedFunction<typeof toolExecutorAttacher>;
  let mockCloseMcpConnections: MockedFunction<typeof closeMcpConnections>;

  beforeEach(() => {
    mockLLM = {
      generateText: vi.fn(),
      supportsTools: true,
      registerTools: vi.fn(),
    };

    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      role: 'Test Role',
      objective: 'Test objective',
      background: 'Test background',
      capabilities: 'Test capabilities',
      apiKey: 'test-key',
      llm: { provider: 'OpenAI' as const, model: { name: 'GPT-4', id: 'gpt-4' } },
      tools: [
        { id: 'tool1', type: 'function', name: 'Tool 1', description: 'Test tool 1', parameters: {} },
        { id: 'tool2', type: 'function', name: 'Tool 2', description: 'Test tool 2', parameters: {} },
      ],
    };

    mockTask = {
      id: 'test-task',
      title: 'Test Task',
      description: 'A test task',
      expectedOutput: 'Test output format',
      type: 'test',
      executorId: 'test-executor',
      position: '0,0',
      selected: false,
      sockets: [],
    };

    mockWebSocket = {
      send: vi.fn(),
      close: vi.fn(),
    };

    mockGetLLMProvider = vi.mocked(getLLMProvider);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetLLMProvider.mockReturnValue(mockLLM as any);

    mockToolExecutorAttacher = vi.mocked(toolExecutorAttacher);
    mockToolExecutorAttacher.mockResolvedValue([]);

    mockCloseMcpConnections = vi.mocked(closeMcpConnections);
    mockCloseMcpConnections.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with all parameters', () => {
      const plan: AgentStep[] = [{ id: '1', action: 'Step 1', rationale: 'First step', expectedOutput: 'Result 1' }];
      new Yallma3GenOneAgentRuntime(
        mockAgent,
        mockTask,
        'test context',
        plan,
        mockWebSocket,
        'workspace-key',
        { provider: 'Groq', model: { name: 'Llama2', id: 'llama2' } },
        'test intent'
      );

      expect(mockGetLLMProvider).toHaveBeenCalledWith(
        mockAgent.llm,
        mockAgent.apiKey
      );
    });
  });

  describe('run', () => {
    it('should register tools when agent has tools', async () => {
      const mockLLMGenerate = vi.mocked(mockLLM.generateText);
      mockLLMGenerate
        .mockResolvedValueOnce('Agent response')
        .mockResolvedValueOnce(JSON.stringify({
          task_completion_status: 'complete',
          feedback: 'Good job',
        }));

      const plan: AgentStep[] = [{ id: '1', action: 'Step 1', rationale: 'First step', expectedOutput: 'Result 1' }];
      const runtime = new Yallma3GenOneAgentRuntime(
        mockAgent,
        mockTask,
        'test context',
        plan,
        mockWebSocket
      );

      await runtime.run();

      expect(mockToolExecutorAttacher).toHaveBeenCalledWith(mockWebSocket, mockAgent.tools);
      expect(mockLLM.registerTools).toHaveBeenCalled();
    });

    it('should complete task when review passes', async () => {
      const mockLLMGenerate = vi.mocked(mockLLM.generateText);
      mockLLMGenerate
        .mockResolvedValueOnce('Agent response')
        .mockResolvedValueOnce(JSON.stringify({
          task_completion_status: 'complete',
          feedback: 'Good job',
        }));

      const plan: AgentStep[] = [{ id: '1', action: 'Step 1', rationale: 'First step', expectedOutput: 'Result 1' }];
      const runtime = new Yallma3GenOneAgentRuntime(
        mockAgent,
        mockTask,
        'test context',
        plan,
        mockWebSocket
      );

      const result = await runtime.run();

      expect(result).toBe('Agent response');
      expect(mockCloseMcpConnections).toHaveBeenCalled();
    });

    it('should perform final check when review suggests revision', async () => {
      const mockLLMGenerate = vi.mocked(mockLLM.generateText);
      mockLLMGenerate
        .mockResolvedValueOnce('Agent response')
        .mockResolvedValueOnce(JSON.stringify({
          task_completion_status: 'needs_revision',
          feedback: 'Needs improvement',
        }))
        .mockResolvedValueOnce(JSON.stringify({
          accept: true,
          reason: 'Good enough',
          next_action: 'deliver',
        }));

      const plan: AgentStep[] = [{ id: '1', action: 'Step 1', rationale: 'First step', expectedOutput: 'Result 1' }];
      const runtime = new Yallma3GenOneAgentRuntime(
        mockAgent,
        mockTask,
        'test context',
        plan,
        mockWebSocket
      );

      const result = await runtime.run();

      expect(result).toBe('Agent response');
      expect(mockLLMGenerate).toHaveBeenCalledTimes(3); // response + review + final check
    });

    it('should accept response when final check passes', async () => {
      const mockLLMGenerate = vi.mocked(mockLLM.generateText);
      mockLLMGenerate
        .mockResolvedValueOnce('Agent response')
        .mockResolvedValueOnce(JSON.stringify({
          task_completion_status: 'needs_revision',
          feedback: 'Needs improvement',
        }))
        .mockResolvedValueOnce(JSON.stringify({
          accept: true,
          reason: 'Good enough',
          next_action: 'deliver',
        }));

      const plan: AgentStep[] = [{ id: '1', action: 'Step 1', rationale: 'First step', expectedOutput: 'Result 1' }];
      const runtime = new Yallma3GenOneAgentRuntime(
        mockAgent,
        mockTask,
        'test context',
        plan,
        mockWebSocket
      );

      const result = await runtime.run();

      expect(result).toBe('Agent response');
      expect(mockLLMGenerate).toHaveBeenCalledTimes(3); // response + review + final check
    });

    it('should handle JSON parsing errors in review', async () => {
      const mockLLMGenerate = vi.mocked(mockLLM.generateText);
      mockLLMGenerate
        .mockResolvedValueOnce('Agent response')
        .mockResolvedValueOnce('Invalid JSON response')
        .mockResolvedValueOnce(JSON.stringify({
          task_completion_status: 'complete',
          feedback: 'Good job',
        }));

      const plan: AgentStep[] = [{ id: '1', action: 'Step 1', rationale: 'First step', expectedOutput: 'Result 1' }];
      const runtime = new Yallma3GenOneAgentRuntime(
        mockAgent,
        mockTask,
        'test context',
        plan,
        mockWebSocket
      );

      await expect(runtime.run()).rejects.toThrow('Failed to parse review JSON');
    });
  });

  describe('buildPrompt', () => {
    it('should include plan in initial prompt', () => {
      const plan: AgentStep[] = [
        { id: '1', action: 'Step 1', rationale: 'First step', expectedOutput: 'Result 1' },
        { id: '2', action: 'Step 2', rationale: 'Second step', expectedOutput: 'Result 2' },
      ];
      const runtime = new Yallma3GenOneAgentRuntime(
        mockAgent,
        mockTask,
        'test context',
        plan,
        mockWebSocket,
        undefined,
        undefined,
        'test intent'
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prompt = (runtime as any).buildPrompt(0, '', null);

      expect(prompt).toContain(`You are ${mockAgent.name}, a highly skilled ${mockAgent.role}`);
      expect(prompt).toContain(`INTENT: test intent`);
      expect(prompt).toContain(JSON.stringify(plan, null, 2));
    });

    it('should include feedback in revision prompt', () => {
      const plan: AgentStep[] = [{ id: '1', action: 'Step 1', rationale: 'First step', expectedOutput: 'Result 1' }];
      const runtime = new Yallma3GenOneAgentRuntime(
        mockAgent,
        mockTask,
        'test context',
        plan,
        mockWebSocket
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prompt = (runtime as any).buildPrompt(1, 'previous result', 'feedback text');

      expect(prompt).toContain('REVISION ROUND');
      expect(prompt).toContain('previous result');
      expect(prompt).toContain('feedback text');
    });
  });

  describe('cleanup', () => {
    it('should call closeMcpConnections', async () => {
      const plan: AgentStep[] = [{ id: '1', action: 'Step 1', rationale: 'First step', expectedOutput: 'Result 1' }];
      const runtime = new Yallma3GenOneAgentRuntime(
        mockAgent,
        mockTask,
        'test context',
        plan,
        mockWebSocket
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (runtime as any).cleanup();

      expect(mockCloseMcpConnections).toHaveBeenCalled();
    });
  });
});