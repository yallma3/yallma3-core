import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTools, callTool, getPrompts, getPrompt, getResources, getResource } from '../../../Utils/Mcp';
import type { ToolCall } from '../../../Models/Mcp';

// Mock the MCP Client
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(),
}));

const TIMEOUT = { timeout: 300_000 };

describe('Mcp Utils', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      listTools: vi.fn(),
      callTool: vi.fn(),
      listPrompts: vi.fn(),
      getPrompt: vi.fn(),
      listResources: vi.fn(),
      readResource: vi.fn(),
    };
  });

  // ── getTools ─────────────────────────────────────────────────────────────────

  describe('getTools', () => {
    it('should return transformed tools successfully', async () => {
      const mockTools = [
        { name: 'tool1', description: 'Tool 1 description', inputSchema: { type: 'object' } },
        { name: 'tool2', description: 'Tool 2 description', inputSchema: { type: 'string' } },
      ];

      mockClient.listTools.mockResolvedValue({ tools: mockTools });

      const result = await getTools(mockClient);

      expect(result).toEqual([
        { name: 'tool1', description: 'Tool 1 description', inputSchema: { type: 'object' } },
        { name: 'tool2', description: 'Tool 2 description', inputSchema: { type: 'string' } },
      ]);
      expect(mockClient.listTools).toHaveBeenCalledTimes(1);
    });

    it('should throw error when listTools fails', async () => {
      mockClient.listTools.mockRejectedValue(new Error('Failed to list tools'));
      await expect(getTools(mockClient)).rejects.toThrow('Failed to list tools');
    });
  });

  // ── callTool ─────────────────────────────────────────────────────────────────

  describe('callTool', () => {
    it('should call tool and return response successfully', async () => {
      const toolCall: ToolCall = { tool: 'testTool', input: { param1: 'value1' } };
      const mockResponse = {
        content: [{ type: 'text', text: 'Tool result' }],
        isError: false,
      };

      mockClient.callTool.mockResolvedValue(mockResponse);

      const result = await callTool(mockClient, toolCall);

      expect(result).toEqual({
        content: [{ type: 'text', text: 'Tool result' }],
        isError: false,
      });

      // callTool(params, undefined, { timeout })
      expect(mockClient.callTool).toHaveBeenCalledWith(
        { name: 'testTool', arguments: { param1: 'value1' } },
        undefined,
        TIMEOUT,
      );
    });

    it('should throw error when callTool fails', async () => {
      const toolCall: ToolCall = { tool: 'failingTool', input: {} };
      mockClient.callTool.mockRejectedValue(new Error('Tool call failed'));
      await expect(callTool(mockClient, toolCall)).rejects.toThrow('Tool call failed');
    });
  });

  // ── getPrompts ───────────────────────────────────────────────────────────────

  describe('getPrompts', () => {
    it('should return transformed prompts successfully', async () => {
      const mockPrompts = [
        { name: 'prompt1', description: 'Prompt 1 description', arguments: [{ name: 'arg1', description: 'Argument 1' }] },
        { name: 'prompt2', description: 'Prompt 2 description', arguments: [] },
      ];

      mockClient.listPrompts.mockResolvedValue({ prompts: mockPrompts });

      const result = await getPrompts(mockClient);

      expect(result).toEqual([
        { name: 'prompt1', description: 'Prompt 1 description', arugments: [{ name: 'arg1', description: 'Argument 1' }] },
        { name: 'prompt2', description: 'Prompt 2 description', arugments: [] },
      ]);
      expect(mockClient.listPrompts).toHaveBeenCalledTimes(1);
    });

    it('should throw error when listPrompts fails', async () => {
      mockClient.listPrompts.mockRejectedValue(new Error('Failed to list prompts'));
      await expect(getPrompts(mockClient)).rejects.toThrow('Failed to list prompts');
    });
  });

  // ── getPrompt ────────────────────────────────────────────────────────────────

  describe('getPrompt', () => {
    it('should return transformed prompt successfully', async () => {
      const mockPromptResult = {
        description: 'Test prompt description',
        messages: [
          { role: 'user', content: { type: 'text', text: 'Hello' } },
          { role: 'assistant', content: { type: 'text', text: 'Hi there' } },
        ],
      };

      mockClient.getPrompt.mockResolvedValue(mockPromptResult);

      const result = await getPrompt(mockClient, 'testPrompt');

      expect(result).toEqual({
        description: 'Test prompt description',
        messages: [
          { role: 'user', content: { type: 'text', text: 'Hello' } },
          { role: 'assistant', content: { type: 'text', text: 'Hi there' } },
        ],
      });

      // getPrompt({ name }, { timeout })
      expect(mockClient.getPrompt).toHaveBeenCalledWith(
        { name: 'testPrompt' },
        TIMEOUT,
      );
    });

    it('should throw error when getPrompt fails', async () => {
      mockClient.getPrompt.mockRejectedValue(new Error('Failed to get prompt'));
      await expect(getPrompt(mockClient, 'failingPrompt')).rejects.toThrow('Failed to get prompt');
    });
  });

  // ── getResources ─────────────────────────────────────────────────────────────

  describe('getResources', () => {
    it('should return transformed resources successfully', async () => {
      const mockResources = [
        { name: 'resource1', description: 'Resource 1 description', uri: 'file:///path/to/resource1' },
        { name: 'resource2', description: 'Resource 2 description', uri: 'http://example.com/resource2' },
      ];

      mockClient.listResources.mockResolvedValue({ resources: mockResources });

      const result = await getResources(mockClient);

      expect(result).toEqual([
        { name: 'resource1', description: 'Resource 1 description', uri: 'file:///path/to/resource1' },
        { name: 'resource2', description: 'Resource 2 description', uri: 'http://example.com/resource2' },
      ]);
      expect(mockClient.listResources).toHaveBeenCalledTimes(1);
    });

    it('should throw error when listResources fails', async () => {
      mockClient.listResources.mockRejectedValue(new Error('Failed to list resources'));
      await expect(getResources(mockClient)).rejects.toThrow('Failed to list resources');
    });
  });

  // ── getResource ──────────────────────────────────────────────────────────────

  describe('getResource', () => {
    it('should return transformed resource successfully', async () => {
      const mockResourceResult = {
        contents: [
          { uri: 'file:///path/to/resource', mimeType: 'text/plain', text: 'Resource content' },
        ],
      };

      mockClient.readResource.mockResolvedValue(mockResourceResult);

      const result = await getResource(mockClient, 'file:///path/to/resource');

      expect(result).toEqual({
        contents: [
          { uri: 'file:///path/to/resource', mimeType: 'text/plain', text: 'Resource content' },
        ],
      });

      // readResource({ uri }, { timeout })
      expect(mockClient.readResource).toHaveBeenCalledWith(
        { uri: 'file:///path/to/resource' },
        TIMEOUT,
      );
    });

    it('should throw error when readResource fails', async () => {
      mockClient.readResource.mockRejectedValue(new Error('Failed to read resource'));
      await expect(getResource(mockClient, 'invalid://uri')).rejects.toThrow('Failed to read resource');
    });
  });
});