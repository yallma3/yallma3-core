import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLLMChatNode } from '../../../Workflow/Nodes/Chat/ChatNode';
import { FatalMainLLMError } from '../../../LLM/LLMRunner';
import type { NodeExecutionContext } from '../../../Workflow/types/types';
import type { ExecutionContext } from '../../../Execution/ExecutionContext';
import type { LLMOption } from '../../../Models/LLM';

const openaiOption: LLMOption = {
  provider: 'OpenAI',
  model: {
    id: 'gpt-4o',
    name: 'GPT-4o',
    contextWindow: { input: 1, output: 1 },
  },
};

function makeContext(overrides?: Partial<NodeExecutionContext>): {
  context: NodeExecutionContext;
  node: ReturnType<typeof createLLMChatNode>;
} {
  const node = createLLMChatNode(1, { x: 0, y: 0 });
  const ctx: ExecutionContext = {
    requestId: 'req-1',
    send: vi.fn(async () => {}),
    onMessage: vi.fn(),
    onClose: vi.fn(() => () => {}),
    broadcast: vi.fn(),
  };
  const context: NodeExecutionContext = {
    node,
    inputs: { [node.id * 100 + 1]: 'hello' },
    ctx,
    mainLLM: { option: openaiOption, apiKey: 'main-key' },
    workflowId: 'wf-chat',
    ...overrides,
  };
  return { context, node };
}

describe('ChatNode (LLMChat) — fatal error propagation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('re-throws FatalMainLLMError instead of returning an error string', async () => {
    // Main LLM request fails → executeWithFallback throws FatalMainLLMError.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('main llm down'))));

    const { context } = makeContext();

    await expect(context.node.process!(context)).rejects.toBeInstanceOf(
      FatalMainLLMError
    );
  });

  it('still converts non-fatal errors into an error-string output', async () => {
    const { context, node } = makeContext({ mainLLM: undefined });

    const result = (await node.process!(context)) as Record<number, unknown>;

    expect(String(result[node.id * 100 + 3])).toContain('mainLLM not available');
    expect(result[node.id * 100 + 4]).toBe(0);
  });
});
