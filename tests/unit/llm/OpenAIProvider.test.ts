import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../../../LLM/LLMProvider';
import type { LLMSpecTool } from '../../../Models/Tool';

// Mock fetch
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  const mockApiKey = 'test-api-key';
  const mockModel = 'gpt-4';

  beforeEach(() => {
    provider = new OpenAIProvider(mockModel, mockApiKey);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct model and apiKey', () => {
      expect(provider.supportsTools).toBe(true);
    });
  });

  describe('registerTools', () => {
    it('should register tools correctly', () => {
      const tools: LLMSpecTool[] = [
        {
          type: 'function',
          name: 'testTool',
          description: 'A test tool',
          parameters: { type: 'object', properties: {} },
          executor: vi.fn(),
        },
      ];

      provider.registerTools(tools);

      // We can't directly test private tools array, but we can test through callLLM
    });
  });

  describe('callLLM', () => {
    const mockMessages = [{ role: 'user' as const, content: 'Hello' }];

    it('should make successful API call and return response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Hello from OpenAI',
            tool_calls: null,
          },
        }],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider.callLLM(mockMessages);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mockApiKey}`,
          },
          body: expect.stringContaining(mockModel),
        })
      );

      expect(result).toEqual({
        content: 'Hello from OpenAI',
        toolCalls: null,
      });
    });

    it('should handle tool calls in response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call_123',
              function: {
                name: 'testTool',
                arguments: '{"param": "value"}',
              },
            }],
          },
        }],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider.callLLM(mockMessages);

      expect(result).toEqual({
        content: 'Calling tool testTool',
        toolCalls: [{
          id: 'call_123',
          name: 'testTool',
          input: { param: 'value' },
        }],
      });
      expect(result.toolCalls?.[0]?.name).toBe('testTool');
    });

    it('should include tools in request when registered', async () => {
      const tools: LLMSpecTool[] = [
        {
          type: 'function',
          name: 'testTool',
          description: 'A test tool',
          parameters: { type: 'object', properties: {} },
          executor: vi.fn(),
        },
      ];

      provider.registerTools(tools);

      const mockResponse = {
        choices: [{
          message: {
            content: 'Response with tools',
            tool_calls: null,
          },
        }],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await provider.callLLM(mockMessages);

      const callBody = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
      expect(callBody.tools).toBeDefined();
      expect(callBody.tools[0].function.name).toBe('testTool');
    });

    it('should throw error on API failure', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(provider.callLLM(mockMessages)).rejects.toThrow(
        'OpenAI API returned status 400'
      );
    });

    it('should throw error on invalid response format', async () => {
      const mockResponse = {
        choices: [],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await expect(provider.callLLM(mockMessages)).rejects.toThrow(
        'Invalid OpenAI response format'
      );
    });
  });

  describe('generateText', () => {
    it('should return content directly when no tool calls', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Direct response',
            tool_calls: null,
          },
        }],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await provider.generateText('Test prompt');

      expect(result).toBe('Direct response');
    });

    it('should execute tools and continue conversation', async () => {
      const tools: LLMSpecTool[] = [
        {
          type: 'function',
          name: 'testTool',
          description: 'A test tool',
          parameters: { type: 'object', properties: {} },
          executor: vi.fn().mockResolvedValue({ result: 'tool output' }),
        },
      ];

      provider.registerTools(tools);

      // First call returns tool call
      const mockToolResponse = {
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call_123',
              function: {
                name: 'testTool',
                arguments: '{"param": "value"}',
              },
            }],
          },
        }],
      };

      // Second call returns final response
      const mockFinalResponse = {
        choices: [{
          message: {
            content: 'Final response after tool use',
            tool_calls: null,
          },
        }],
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockToolResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockFinalResponse),
        });

      const result = await provider.generateText('Test prompt');

      expect(result).toBe('Final response after tool use');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should throw error when maximum iterations exceeded', async () => {
      const tools: LLMSpecTool[] = [
        {
          type: 'function',
          name: 'testTool',
          description: 'A test tool',
          parameters: { type: 'object', properties: {} },
          executor: vi.fn().mockResolvedValue({ result: 'tool output' }),
        },
      ];

      provider.registerTools(tools);

      // Always return tool calls to exceed iterations
      const mockResponse = {
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call_123',
              function: {
                name: 'testTool',
                arguments: '{"param": "value"}',
              },
            }],
          },
        }],
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await expect(provider.generateText('Test prompt')).rejects.toThrow(
        'Maximum tool call iterations (10) exceeded'
      );
    });
  });
});