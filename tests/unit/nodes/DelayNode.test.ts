import { describe, it, expect, beforeEach } from 'vitest';
import { createDelayNode } from '../../../Workflow/Nodes/DelayNode';
import type { NodeExecutionContext } from '../../../Workflow/types/types';

describe('DelayNode', () => {
  let node: ReturnType<typeof createDelayNode>;
  let mockContext: NodeExecutionContext;

  beforeEach(() => {
    node = createDelayNode(1, { x: 0, y: 0 });
    mockContext = {
      node,
      inputs: {},
    };
  });

  describe('creation', () => {
    it('should create a delay node with correct properties', () => {
      expect(node.id).toBe(1);
      expect(node.nodeType).toBe('Delay');
      expect(node.title).toBe('Delay (ms)');
      expect(node.category).toBe('Logic');
      expect(node.nodeValue).toBe(1000);
      expect(node.sockets).toHaveLength(2);
      expect(node.configParameters?.length).toBe(1);
    });

    it('should have correct socket configuration', () => {
      expect(node.sockets[0]?.title).toBe('Input');
      expect(node.sockets[0]?.type).toBe('input');
      expect(node.sockets[1]?.title).toBe('Output');
      expect(node.sockets[1]?.type).toBe('output');
    });
  });

  describe('process', () => {
    it('should delay for the specified time and pass input to output', async () => {
      const startTime = Date.now();
      mockContext.inputs = { 101: 'test input' }; // Input socket id = 1 * 100 + 1 = 101

      const result = await node.process!(mockContext);

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(1000); // Should wait at least 1000ms
      expect(result).toEqual({ 102: 'test input' }); // Output socket id = 1 * 100 + 2 = 102
    });

    it('should use custom delay time from config parameter', async () => {
      node.setConfigParameter!('Delay (ms)', 500);
      const startTime = Date.now();
      mockContext.inputs = { 101: 'test input' };

      const result = await node.process!(mockContext);

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(500);
      expect(elapsed).toBeLessThan(1000); // Should be less than default 1000ms
      expect(result).toEqual({ 102: 'test input' });
    });

    it('should handle zero delay', async () => {
      node.setConfigParameter!('Delay (ms)', 0);
      const startTime = Date.now();
      mockContext.inputs = { 101: 'test input' };

      const result = await node.process!(mockContext);

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      expect(elapsed).toBeLessThan(100); // Should complete quickly
      expect(result).toEqual({ 102: 'test input' });
    });

    it('should update node value to show current delay', async () => {
      node.setConfigParameter!('Delay (ms)', 2000);

      await node.process!(mockContext);

      expect(node.nodeValue).toBe('2000 ms');
    });
  });

  describe('config parameters', () => {
    it('should get config parameters', () => {
      const params = node.getConfigParameters!();
      expect(params).toHaveLength(1);
      expect(params[0]?.parameterName).toBe('Delay (ms)');
      expect(params[0]?.defaultValue).toBe(1000);
    });

    it('should get specific config parameter', () => {
      const param = node.getConfigParameter!('Delay (ms)');
      expect(param?.parameterName).toBe('Delay (ms)');
      expect(param?.defaultValue).toBe(1000);
    });

    it('should set config parameter and update node value', () => {
      node.setConfigParameter!('Delay (ms)', 1500);

      const param = node.getConfigParameter!('Delay (ms)');
      expect(param?.paramValue).toBe(1500);
      expect(node.nodeValue).toBe('1500 ms');
    });
  });
});