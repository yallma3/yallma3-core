import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRunWorkspace } from '../../../Utils/Runtime';
import type { WorkspaceData } from '../../../Models/Workspace';

// Mock dependencies
vi.mock('../../../Agent/Main/MainAgentRegistry', () => ({
  getMainAgent: vi.fn(),
}));

vi.mock('../../../Workflow/runtime', () => ({
  executeFlowRuntime: vi.fn(),
}));

vi.mock('../../../Task/TaskGraph', () => ({
  getTaskExecutionOrderWithContext: vi.fn(),
}));

vi.mock('../../../Task/TaskIntrepreter', () => ({
  analyzeTaskCore: vi.fn(),
  planAgenticTask: vi.fn(),
}));

vi.mock('../../../Agent/Utls/MainAgentHelper', () => ({
  assignBestFit: vi.fn(),
}));

vi.mock('../../../Agent/Utls/ToolCallingHelper', () => ({
  workflowExecutor: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('path', () => ({
  join: vi.fn(),
}));

import { getMainAgent } from '../../../Agent/Main/MainAgentRegistry';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

describe('Workspace Regression Tests', () => {
  let mockWorkspaceData: WorkspaceData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockWebSocket: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockMainAgent: any;

  beforeEach(() => {
    mockWebSocket = { send: vi.fn() };
    mockMainAgent = {};
    mockWorkspaceData = {
      id: 'test-workspace-regression',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      name: 'Regression Test Workspace',
      description: 'Workspace for regression testing',
      mainLLM: { provider: 'OpenAI' as const, model: { name: 'GPT-4', id: 'gpt-4' } },
      apiKey: 'test-api-key',
      useSavedCredentials: false,
      agents: [{
        id: 'test-agent',
        name: 'Test Agent',
        role: 'Test Role',
        objective: 'Test objective',
        background: 'Test background',
        capabilities: 'Test capabilities',
        apiKey: 'test-key',
        llm: { provider: 'OpenAI' as const, model: { name: 'GPT-4', id: 'gpt-4' } },
        tools: [],
      }],
      tasks: [{
        id: 'test-task-1',
        title: 'Test Task 1',
        description: 'First test task',
        expectedOutput: 'Test output 1',
        type: 'agentic' as const,
        executorId: 'test-agent',
        position: '{"x":0,"y":0}',
        selected: false,
        sockets: [],
      }, {
        id: 'test-task-2',
        title: 'Test Task 2',
        description: 'Second test task',
        expectedOutput: 'Test output 2',
        type: 'agentic' as const,
        executorId: 'test-agent',
        position: '{"x":100,"y":0}',
        selected: false,
        sockets: [],
      }],
      workflows: [],
      connections: [],
    };

    mockWebSocket = {
      send: vi.fn(),
    };

    mockMainAgent = {
      run: vi.fn().mockResolvedValue({
        'test-task-1': 'Result 1',
        'test-task-2': 'Result 2',
      }),
    };

    vi.mocked(getMainAgent).mockReturnValue(mockMainAgent);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(join).mockReturnValue('/mock/output/path.txt');
  });

  it('should complete workspace execution successfully with mock data', async () => {
    const workspaceJson = JSON.stringify(mockWorkspaceData);

    await handleRunWorkspace(workspaceJson, mockWebSocket);

    // Verify main agent was called with correct parameters
    expect(getMainAgent).toHaveBeenCalledWith('1.0.0', mockWorkspaceData, mockWebSocket);

    // Verify main agent run was called
    expect(mockMainAgent.run).toHaveBeenCalled();
  });

  it('should handle workspace execution errors gracefully', async () => {
    // Mock main agent to throw an error
    mockMainAgent.run.mockRejectedValue(new Error('Workspace execution failed'));

    const workspaceJson = JSON.stringify(mockWorkspaceData);

    // Should not throw, but handle error internally
    await expect(handleRunWorkspace(workspaceJson, mockWebSocket)).rejects.toThrow('Workspace execution failed');

    // Verify error handling
    expect(getMainAgent).toHaveBeenCalledWith('1.0.0', mockWorkspaceData, mockWebSocket);
    expect(mockMainAgent.run).toHaveBeenCalled();
  });

  it('should handle invalid workspace JSON', async () => {
    const invalidJson = '{ invalid json }';

    await expect(handleRunWorkspace(invalidJson, mockWebSocket)).rejects.toThrow();
  });

  it('should handle invalid workspace JSON', async () => {
    const invalidJson = '{ invalid json }';

    await expect(handleRunWorkspace(invalidJson, mockWebSocket)).rejects.toThrow();
  });
});