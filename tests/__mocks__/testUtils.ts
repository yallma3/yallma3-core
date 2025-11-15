/**
 * Common test utilities and helpers
 */

import { vi } from 'vitest';
import type { Agent } from '../../Models/Agent';
import type { Task } from '../../Models/Task';
import type { LLMProvider } from '../../Models/LLM';
import type { Tool } from '../../Models/Tool';

export const createMockAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'test-agent',
  name: 'Test Agent',
  role: 'Test Role',
  objective: 'Test objective',
  background: 'Test background',
  capabilities: 'Test capabilities',
  apiKey: 'test-key',
  llm: { provider: 'OpenAI' as const, model: { name: 'GPT-4', id: 'gpt-4' } },
  tools: [],
  ...overrides,
});

export const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'test-task',
  title: 'Test Task',
  description: 'A test task',
  expectedOutput: 'Test output format',
  type: 'test',
  executorId: 'test-executor',
  position: '0,0',
  selected: false,
  sockets: [],
  ...overrides,
});

export const createMockLLMProvider = (overrides: Partial<LLMProvider> = {}): LLMProvider => ({
  generateText: vi.fn().mockResolvedValue('Mock response'),
  supportsTools: false,
  registerTools: vi.fn(),
  ...overrides,
});

export const createMockTool = (overrides: Partial<Tool> = {}): Tool => ({
  id: 'test-tool',
  type: 'function',
  name: 'Test Tool',
  description: 'A test tool',
  parameters: {},
  ...overrides,
});

export const createMockWebSocket = () => ({
  send: vi.fn(),
  close: vi.fn(),
  onmessage: vi.fn(),
  onclose: vi.fn(),
  onerror: vi.fn(),
});

// Helper to wait for async operations
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to create test data factories
export const createTestData = {
  json: {
    simple: { name: 'John', age: 30 },
    nested: { user: { name: 'Jane', profile: { age: 25, city: 'NYC' } } },
    array: [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }],
  },
  text: {
    short: 'Hello World',
    long: 'This is a longer piece of text for testing purposes.',
  },
};