import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { creatOpenAIChatNode } from '../../../Workflow/Nodes/Chat/OpenAiChatNode';
import type { NodeExecutionContext } from '../../../Workflow/types/types';

// Mock fetch
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('OpenAiChatNode', () => {
  let node: ReturnType<typeof creatOpenAIChatNode>;
  let mockContext: NodeExecutionContext;

  beforeEach(() => {
    node = creatOpenAIChatNode(1, { x: 0, y: 0 });
    mockContext = {
      node,
      inputs: {},
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('creation', () => {
    it('should create an OpenAI chat node with correct properties', () => {
      expect(node.id).toBe(1);
      expect(node.nodeType).toBe('OpenAIChat');
      expect(node.title).toBe('OpenAI Chat');
      expect(node.category).toBe('AI');
      expect(node.sockets).toHaveLength(4);
      expect(node.configParameters?.length).toBe(2);
    });

    it('should have correct socket configuration', () => {
      expect(node.sockets[0]?.title).toBe('Prompt');
      expect(node.sockets[0]?.type).toBe('input');
      expect(node.sockets[1]?.title).toBe('System Prompt');
      expect(node.sockets[1]?.type).toBe('input');
      expect(node.sockets[2]?.title).toBe('Response');
      expect(node.sockets[2]?.type).toBe('output');
      expect(node.sockets[3]?.title).toBe('Tokens');
      expect(node.sockets[3]?.type).toBe('output');
    });
  });

  describe('process', () => {
    beforeEach(() => {
      // Set config parameters
      node.setConfigParameter!('API Key', 'test-api-key');
      node.setConfigParameter!('Model', 'gpt-4o-mini');
    });

    const mockInputs = {
      101: 'Hello, how are you?', // prompt
      102: 'You are a helpful assistant.', // system prompt
    };

    it('should successfully process chat request and return response', async () => {
      mockContext.inputs = mockInputs;

      const mockResponse = {
        choices: [{
          message: {
            content: 'I am doing well, thank you!',
          },
        }],
        usage: {
          total_tokens: 25,
        },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await node.process!(mockContext);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
          },
        })
      );

      expect(result).toEqual({
        103: 'I am doing well, thank you!',
        104: 25,
      });
    });

    it('should use default model when not set', async () => {
      node.setConfigParameter!('Model', ''); // Clear model
      mockContext.inputs = {
        101: 'Hello',
      };

      const mockResponse = {
        choices: [{
          message: {
            content: 'Hello back!',
          },
        }],
        usage: {
          total_tokens: 10,
        },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await node.process!(mockContext);

      const callBody = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
      expect(callBody.model).toBe('gpt-4o-mini'); // default model
    });

    it('should handle empty content gracefully', async () => {
      mockContext.inputs = mockInputs;

      const mockResponse = {
        choices: [{
          message: {
            content: null,
          },
        }],
        usage: {
          total_tokens: 5,
        },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        103: '',
        104: 5,
      });
    });

    it('should handle missing choices array', async () => {
      mockContext.inputs = mockInputs;

      const mockResponse = {
        choices: [],
        usage: {
          total_tokens: 0,
        },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        103: '',
        104: 0,
      });
    });

    it('should handle missing usage object', async () => {
      mockContext.inputs = mockInputs;

      const mockResponse = {
        choices: [{
          message: {
            content: 'Response without usage',
          },
        }],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        103: 'Response without usage',
        104: 0,
      });
    });

    it('should handle API failure', async () => {
      mockContext.inputs = mockInputs;

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        103: 'Error: OpenAI API returned status 429',
        104: 0,
      });
    });

    it('should handle network errors', async () => {
      mockContext.inputs = mockInputs;

      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        103: 'Error: Network error',
        104: 0,
      });
    });
  });

  describe('config parameters', () => {
    it('should get config parameters', () => {
      const params = node.getConfigParameters!();
      expect(params).toHaveLength(2);
      expect(params[0]?.parameterName).toBe('Model');
      expect(params[1]?.parameterName).toBe('API Key');
    });

    it('should get specific config parameter', () => {
      const param = node.getConfigParameter!('Model');
      expect(param?.parameterName).toBe('Model');
      expect(param?.defaultValue).toBe('gpt-4o-mini');
    });

    it('should set config parameter', () => {
      node.setConfigParameter!('Model', 'gpt-3.5-turbo');

      const param = node.getConfigParameter!('Model');
      expect(param?.paramValue).toBe('gpt-3.5-turbo');
    });
  });
});