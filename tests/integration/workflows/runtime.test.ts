import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Workflow } from '../../../Models/Workflow';
import type { LLMOption } from '../../../Models/LLM';
import type { ExecutionContext } from '../../../Execution/ExecutionContext';

// Capture the context each node's process() is invoked with.
const { processSpy } = vi.hoisted(() => ({
  processSpy: vi.fn(async (_context: unknown) => 'ok'),
}));

// Provide a single synthetic node so we can observe the injected context
// without booting the full node registry.
vi.mock('../../../Workflow/utils/runtime', () => ({
  hydrateWorkflowNodes: vi.fn(() => [
    {
      id: 1,
      nodeType: 'TestNode',
      title: 'Test Node',
      sockets: [{ id: 1, title: 'output', type: 'output', nodeId: 1, dataType: 'string' }],
      process: processSpy,
    },
  ]),
}));

vi.mock('../../../Execution/WorkspaceRepository', () => ({
  WorkspaceRepository: {
    getInstance: () => ({
      getCurrent: () => 'ws-1',
      get: (id: string) =>
        id === 'ws-1'
          ? {
              mainLLM: {
                provider: 'OpenAI',
                model: {
                  id: 'gpt-4o',
                  name: 'GPT-4o',
                  contextWindow: { input: 1, output: 1 },
                },
              },
              apiKey: 'ws-key',
            }
          : undefined,
    }),
  },
}));

import { executeFlowRuntime } from '../../../Workflow/runtime';

const mockCtx = {
  requestId: 'req-1',
  send: vi.fn(async () => {}),
  onMessage: vi.fn(),
  onClose: vi.fn(() => () => {}),
  broadcast: vi.fn(),
} as unknown as ExecutionContext;

function makeWorkflow(id = 'wf-injection'): Workflow {
  return {
    id,
    name: 'Injection Workflow',
    description: 'noop',
    nodes: [
      {
        id: 1,
        category: 'Test',
        title: 'Test Node',
        nodeType: 'TestNode',
        sockets: [{ id: 1, title: 'output', type: 'output', nodeId: 1, dataType: 'string' }],
      },
    ],
    connections: [],
  };
}

interface CapturedContext {
  workflowId?: string;
  mainLLM?: { option: LLMOption; apiKey: string };
}

describe('executeFlowRuntime — NodeExecutionContext injection', () => {
  beforeEach(() => {
    processSpy.mockClear();
  });

  it('injects mainLLM and workflowId into the node context', async () => {
    await executeFlowRuntime(makeWorkflow('wf-injection'), mockCtx);

    expect(processSpy).toHaveBeenCalledTimes(1);
    const context = processSpy.mock.calls[0]![0] as CapturedContext;

    expect(context.workflowId).toBe('wf-injection');
    expect(context.mainLLM).toEqual({
      option: {
        provider: 'OpenAI',
        model: {
          id: 'gpt-4o',
          name: 'GPT-4o',
          contextWindow: { input: 1, output: 1 },
        },
      },
      apiKey: 'ws-key',
    });
  });

  it('leaves mainLLM undefined when there is no current workspace', async () => {
    const repoModule = await import('../../../Execution/WorkspaceRepository');
    const getInstanceSpy = vi
      .spyOn(repoModule.WorkspaceRepository, 'getInstance')
      .mockReturnValue({
        getCurrent: () => null,
        get: () => undefined,
      } as unknown as ReturnType<typeof repoModule.WorkspaceRepository.getInstance>);

    await executeFlowRuntime(makeWorkflow('wf-no-ws'), mockCtx);

    const context = processSpy.mock.calls[0]![0] as CapturedContext;
    expect(context.workflowId).toBe('wf-no-ws');
    expect(context.mainLLM).toBeUndefined();

    getInstanceSpy.mockRestore();
  });
});
