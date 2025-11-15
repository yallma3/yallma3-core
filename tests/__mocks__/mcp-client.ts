import { vi } from 'vitest';

export const mockMcpSTDIOClient = {
  init: vi.fn().mockResolvedValue(undefined),
  test: vi.fn().mockResolvedValue(true),
  listTools: vi.fn().mockResolvedValue([
    { name: 'test-tool', description: 'A test tool', inputSchema: {} }
  ]),
  listPrompts: vi.fn().mockResolvedValue([
    { name: 'test-prompt', description: 'A test prompt' }
  ]),
  listResources: vi.fn().mockResolvedValue([
    { uri: 'test://resource', name: 'Test Resource' }
  ]),
  callTool: vi.fn().mockResolvedValue({ result: 'tool result' }),
  getPrompt: vi.fn().mockResolvedValue({ content: 'prompt content' }),
  readResource: vi.fn().mockResolvedValue({ content: 'resource content' }),
};

export const mockMcpHttpClient = {
  init: vi.fn().mockResolvedValue(undefined),
  test: vi.fn().mockResolvedValue(true),
  listTools: vi.fn().mockResolvedValue([
    { name: 'http-tool', description: 'An HTTP tool', inputSchema: {} }
  ]),
  listPrompts: vi.fn().mockResolvedValue([
    { name: 'http-prompt', description: 'An HTTP prompt' }
  ]),
  listResources: vi.fn().mockResolvedValue([
    { uri: 'http://resource', name: 'HTTP Resource' }
  ]),
  callTool: vi.fn().mockResolvedValue({ result: 'http tool result' }),
  getPrompt: vi.fn().mockResolvedValue({ content: 'http prompt content' }),
  readResource: vi.fn().mockResolvedValue({ content: 'http resource content' }),
};

// Mock the constructors
vi.mock('../../../Utils/McpStdioClient', () => ({
  McpSTDIOClient: vi.fn().mockImplementation(() => mockMcpSTDIOClient),
}));

vi.mock('../../../Utils/McpHttpClient', () => ({
  McpHttpClient: vi.fn().mockImplementation(() => mockMcpHttpClient),
}));