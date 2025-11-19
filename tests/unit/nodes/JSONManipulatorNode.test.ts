import { describe, it, expect, beforeEach } from 'vitest';
import { createJSONManipulatorNode } from '../../../Workflow/Nodes/JSONManipulatorNode';
import type { NodeExecutionContext } from '../../../Workflow/types/types';

describe('JSONManipulatorNode', () => {
  let node: ReturnType<typeof createJSONManipulatorNode>;
  let mockContext: NodeExecutionContext;

  beforeEach(() => {
    node = createJSONManipulatorNode(1, { x: 0, y: 0 });
    mockContext = {
      node,
      inputs: {},
    };
  });

  describe('creation', () => {
    it('should create a JSON manipulator node with correct properties', () => {
      expect(node.id).toBe(1);
      expect(node.nodeType).toBe('JSONManipulator');
      expect(node.title).toBe('JSON Manipulator');
      expect(node.category).toBe('Text');
      expect(node.nodeValue).toBe('JSON Processor');
      expect(node.sockets).toHaveLength(3);
      expect(node.configParameters?.length).toBe(4);
    });

    it('should have correct socket configuration', () => {
      expect(node.sockets[0]?.title).toBe('JSON Input');
      expect(node.sockets[0]?.type).toBe('input');
      expect(node.sockets[1]?.title).toBe('Result');
      expect(node.sockets[1]?.type).toBe('output');
      expect(node.sockets[2]?.title).toBe('Status');
      expect(node.sockets[2]?.type).toBe('output');
    });
  });

  describe('process - extract_field', () => {
    const testJson = JSON.stringify({
      title: 'Test Document',
      data: { name: 'John', age: 30 },
      items: [{ id: 1, value: 'A' }, { id: 2, value: 'B' }],
    });

    it('should extract simple field', async () => {
      node.setConfigParameter!('Operation', 'extract_field');
      node.setConfigParameter!('Field Path', 'title');
      node.setConfigParameter!('Output Format', 'string');
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: 'Test Document',
        103: 'Success: extract_field operation completed',
      });
    });

    it('should extract nested field', async () => {
      node.setConfigParameter!('Operation', 'extract_field');
      node.setConfigParameter!('Field Path', 'data.name');
      node.setConfigParameter!('Output Format', 'string');
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: 'John',
        103: 'Success: extract_field operation completed',
      });
    });

    it('should extract array field', async () => {
      node.setConfigParameter!('Operation', 'extract_field');
      node.setConfigParameter!('Field Path', 'items');
      node.setConfigParameter!('Output Format', 'array');
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: JSON.stringify([{ id: 1, value: 'A' }, { id: 2, value: 'B' }], null, 2),
        103: 'Success: extract_field operation completed',
      });
    });

    it('should extract field from array elements', async () => {
      node.setConfigParameter!('Operation', 'extract_field');
      node.setConfigParameter!('Field Path', 'value');
      node.setConfigParameter!('Output Format', 'array');
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: JSON.stringify([null], null, 2),
        103: 'Success: extract_field operation completed',
      });
    });
  });

  describe('process - extract_array', () => {
    const testJson = JSON.stringify({
      items: [
        { name: 'Item 1', category: 'A' },
        { name: 'Item 2', category: 'B' },
        { name: 'Item 3', category: 'A' },
      ],
    });

    it('should extract array field', async () => {
      node.setConfigParameter!('Operation', 'extract_array');
      node.setConfigParameter!('Field Path', 'items');
      node.setConfigParameter!('Output Format', 'array');
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: JSON.stringify([
          { name: 'Item 1', category: 'A' },
          { name: 'Item 2', category: 'B' },
          { name: 'Item 3', category: 'A' },
        ], null, 2),
        103: 'Success: extract_array operation completed',
      });
    });
  });

  describe('process - filter', () => {
    const testJson = JSON.stringify([
      { name: 'John', age: 25, city: 'NYC' },
      { name: 'Jane', age: 30, city: 'LA' },
      { name: 'Bob', age: 35, city: 'NYC' },
    ]);

    it('should filter by contains condition', async () => {
      node.setConfigParameter!('Operation', 'filter');
      node.setConfigParameter!('Filter Condition', 'city contains "NYC"');
      node.setConfigParameter!('Output Format', 'array');
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: JSON.stringify([
          { name: 'John', age: 25, city: 'NYC' },
          { name: 'Bob', age: 35, city: 'NYC' },
        ], null, 2),
        103: 'Success: filter operation completed',
      });
    });

    it('should filter by greater than condition', async () => {
      node.setConfigParameter!('Operation', 'filter');
      node.setConfigParameter!('Filter Condition', 'age > 28');
      node.setConfigParameter!('Output Format', 'array');
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: JSON.stringify([
          { name: 'Jane', age: 30, city: 'LA' },
          { name: 'Bob', age: 35, city: 'NYC' },
        ], null, 2),
        103: 'Success: filter operation completed',
      });
    });

    it('should filter by equals condition', async () => {
      node.setConfigParameter!('Operation', 'filter');
      node.setConfigParameter!('Filter Condition', 'name == "Jane"');
      node.setConfigParameter!('Output Format', 'array');
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: JSON.stringify([
          { name: 'Jane', age: 30, city: 'LA' },
        ], null, 2),
        103: 'Success: filter operation completed',
      });
    });
  });

  describe('process - count', () => {
    const testJson = JSON.stringify({
      items: [1, 2, 3, 4, 5],
      data: { values: ['a', 'b', 'c'] },
    });

    it('should count items in array', async () => {
      node.setConfigParameter!('Operation', 'count');
      node.setConfigParameter!('Field Path', 'items');
      node.setConfigParameter!('Output Format', 'string');
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: '5',
        103: 'Success: count operation completed',
      });
    });

    it('should count items in nested array', async () => {
      node.setConfigParameter!('Operation', 'count');
      node.setConfigParameter!('Field Path', 'data.values');
      node.setConfigParameter!('Output Format', 'string');
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: '3',
        103: 'Success: count operation completed',
      });
    });

    it('should count top-level items', async () => {
      node.setConfigParameter!('Operation', 'count');
      node.setConfigParameter!('Output Format', 'count');
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: '1', // Object has 1 top-level item
        103: 'Success: count operation completed',
      });
    });
  });

  describe('process - transform', () => {
    const testJson = JSON.stringify([
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
    ]);

    it('should transform array items', async () => {
      node.setConfigParameter!('Operation', 'transform');
      node.setConfigParameter!('Field Path', 'name');
      node.setConfigParameter!('Output Format', 'array');
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: JSON.stringify([
          { name: 'Item 1' },
          { name: 'Item 2' },
        ], null, 2),
        103: 'Success: transform operation completed',
      });
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON input', async () => {
      node.setConfigParameter!('Operation', 'extract_field');
      node.setConfigParameter!('Field Path', 'title');
      mockContext.inputs = { 101: 'invalid json' };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: '',
        103: 'Error: Invalid JSON input: Unexpected token \'i\', "invalid json" is not valid JSON',
      });
    });

    it('should handle non-string input', async () => {
      node.setConfigParameter!('Operation', 'extract_field');
      mockContext.inputs = { 101: 123 };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: '',
        103: 'Error: JSON input is required and must be a string',
      });
    });

    it('should handle missing input', async () => {
      node.setConfigParameter!('Operation', 'extract_field');
      mockContext.inputs = { 101: undefined };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: '',
        103: 'Error: JSON input is required and must be a string',
      });
    });

    it('should handle unsupported operation', async () => {
      node.setConfigParameter!('Operation', 'unsupported_op');
      mockContext.inputs = { 101: JSON.stringify({ test: 'data' }) };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        102: '',
        103: 'Error: Unsupported operation: unsupported_op',
      });
    });
  });

  describe('config parameters', () => {
    it('should get config parameters', () => {
      const params = node.getConfigParameters!();
      expect(params).toHaveLength(4);
      expect(params[0]?.parameterName).toBe('Operation');
      expect(params[1]?.parameterName).toBe('Field Path');
      expect(params[2]?.parameterName).toBe('Filter Condition');
      expect(params[3]?.parameterName).toBe('Output Format');
    });

    it('should set config parameter', () => {
      node.setConfigParameter!('Operation', 'filter');

      const param = node.getConfigParameter!('Operation');
      expect(param?.paramValue).toBe('filter');
    });
  });
});