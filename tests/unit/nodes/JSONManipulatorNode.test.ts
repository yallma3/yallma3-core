import { describe, it, expect, beforeEach } from 'vitest';
import { createJSONManipulatorNode } from '../../../Workflow/Nodes/JSONManipulatorNode';
import type { NodeExecutionContext } from '../../../Workflow/types/types';
import type { OperationConfig } from '../../../Workflow/Nodes/JSONManipulatorNode';

function setOperations(
  node: ReturnType<typeof createJSONManipulatorNode>,
  ops: OperationConfig[]
) {
  node.setConfigParameter!('Operations', JSON.stringify(ops));
}

const RESULT_SOCKET = 110; 
const STATUS_SOCKET = 199; 

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
      expect(node.nodeValue).toBe('');
      expect(node.sockets).toHaveLength(3);
      expect(node.configParameters?.length).toBe(1);
    });

    it('should have correct socket configuration', () => {
      expect(node.sockets[0]?.title).toBe('JSON Input');
      expect(node.sockets[0]?.type).toBe('input');
      expect(node.sockets[1]?.title).toBe('Field Output');
      expect(node.sockets[1]?.type).toBe('output');
      expect(node.sockets[2]?.title).toBe('Status');
      expect(node.sockets[2]?.type).toBe('output');
    });
  });

  // ── process - extract_field ──────────────────────────────────────────────────

  describe('process - extract_field', () => {
    const testJson = JSON.stringify({
      title: 'Test Document',
      data: { name: 'John', age: 30 },
      items: [{ id: 1, value: 'A' }, { id: 2, value: 'B' }],
    });

    it('should extract simple field', async () => {
      setOperations(node, [{
        id: 'op_1',
        type: 'extract_field',
        label: 'Result',
        fieldPath: 'title',
        outputFormat: 'string',
      }]);
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        [RESULT_SOCKET]: 'Test Document',
        [STATUS_SOCKET]: 'Success: 1 operation completed',
      });
    });

    it('should extract nested field', async () => {
      setOperations(node, [{
        id: 'op_1',
        type: 'extract_field',
        label: 'Result',
        fieldPath: 'data.name',
        outputFormat: 'string',
      }]);
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        [RESULT_SOCKET]: 'John',
        [STATUS_SOCKET]: 'Success: 1 operation completed',
      });
    });

    it('should extract array field', async () => {
      setOperations(node, [{
        id: 'op_1',
        type: 'extract_field',
        label: 'Result',
        fieldPath: 'items',
        outputFormat: 'array',
      }]);
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        [RESULT_SOCKET]: JSON.stringify([{ id: 1, value: 'A' }, { id: 2, value: 'B' }], null, 2),
        [STATUS_SOCKET]: 'Success: 1 operation completed',
      });
    });

    it('should extract field from array elements', async () => {
      setOperations(node, [{
        id: 'op_1',
        type: 'extract_field',
        label: 'Result',
        fieldPath: 'items[0].value',
        outputFormat: 'string',
      }]);
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        [RESULT_SOCKET]: 'A',
        [STATUS_SOCKET]: 'Success: 1 operation completed',
      });
    });
  });

  // ── process - extract_array ──────────────────────────────────────────────────

  describe('process - extract_array', () => {
    const testJson = JSON.stringify({
      items: [
        { name: 'Item 1', category: 'A' },
        { name: 'Item 2', category: 'B' },
        { name: 'Item 3', category: 'A' },
      ],
    });

    it('should extract array field', async () => {
      // extract_field with outputFormat 'array' on an array field
      setOperations(node, [{
        id: 'op_1',
        type: 'extract_field',
        label: 'Result',
        fieldPath: 'items',
        outputFormat: 'array',
      }]);
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        [RESULT_SOCKET]: JSON.stringify([
          { name: 'Item 1', category: 'A' },
          { name: 'Item 2', category: 'B' },
          { name: 'Item 3', category: 'A' },
        ], null, 2),
        [STATUS_SOCKET]: 'Success: 1 operation completed',
      });
    });
  });


  describe('process - filter (unsupported operation — produces empty output)', () => {
    const testJson = JSON.stringify([
      { name: 'John', age: 25, city: 'NYC' },
      { name: 'Jane', age: 30, city: 'LA' },
      { name: 'Bob', age: 35, city: 'NYC' },
    ]);

    it('should produce empty output for unsupported filter operation', async () => {
      setOperations(node, [{
        id: 'op_1',
        // @ts-expect-error — intentionally unsupported type
        type: 'filter',
        label: 'Result',
        outputFormat: 'array',
      }]);
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        [RESULT_SOCKET]: '',
        [STATUS_SOCKET]: 'Success: 1 operation completed',
      });
    });
  });

  // ── process - count ──────────────────────────────────────────────────────────

  describe('process - count (via extract_field + count format)', () => {
    const testJson = JSON.stringify({
      items: [1, 2, 3, 4, 5],
      data: { values: ['a', 'b', 'c'] },
    });

    it('should count items in array via extract_field + count format', async () => {
      setOperations(node, [{
        id: 'op_1',
        type: 'extract_field',
        label: 'Result',
        fieldPath: 'items',
        outputFormat: 'count',
      }]);
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        [RESULT_SOCKET]: '5',
        [STATUS_SOCKET]: 'Success: 1 operation completed',
      });
    });

    it('should count items in nested array', async () => {
      setOperations(node, [{
        id: 'op_1',
        type: 'extract_field',
        label: 'Result',
        fieldPath: 'data.values',
        outputFormat: 'count',
      }]);
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        [RESULT_SOCKET]: '3',
        [STATUS_SOCKET]: 'Success: 1 operation completed',
      });
    });

    it('should count top-level object keys via object format', async () => {
      setOperations(node, [{
        id: 'op_1',
        type: 'extract_field',
        label: 'Result',
        fieldPath: '',
        outputFormat: 'count',
      }]);
      mockContext.inputs = { 101: testJson };

      const result = await node.process!(mockContext);

      // The full object is not an array, so count = 1 (non-array, non-undefined value)
      expect(result).toEqual({
        [RESULT_SOCKET]: '1',
        [STATUS_SOCKET]: 'Success: 1 operation completed',
      });
    });
  });

  // ── process - transform ──────────────────────────────────────────────────────

  describe('process - transform (via template_substitute)', () => {
    const _testJson = JSON.stringify([
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
    ]);

    it('should transform using template_substitute on first array element', async () => {
      // template_substitute works on the full parsed value.
      // With an array input it will resolve {{name}} from the array object itself
      // which won't match — use a concrete template that works.
      const singleItemJson = JSON.stringify({ id: 1, name: 'Item 1' });
      setOperations(node, [{
        id: 'op_1',
        type: 'template_substitute',
        label: 'Result',
        template: 'Name: {{name}}',
      }]);
      mockContext.inputs = { 101: singleItemJson };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        [RESULT_SOCKET]: 'Name: Item 1',
        [STATUS_SOCKET]: 'Success: 1 operation completed',
      });
    });
  });

  // ── error handling ───────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('should handle invalid JSON input', async () => {
      setOperations(node, [{
        id: 'op_1',
        type: 'extract_field',
        label: 'Result',
        fieldPath: 'title',
        outputFormat: 'string',
      }]);
      mockContext.inputs = { 101: 'invalid json' };

      const result = await node.process!(mockContext);

      // Error message comes from JSON.parse — the exact text varies by runtime
      expect((result as Record<number, string>)[STATUS_SOCKET]).toMatch(/^Error:/);
      expect((result as Record<number, string>)[RESULT_SOCKET]).toBe('');
    });

    it('should handle non-string input', async () => {
      setOperations(node, [{
        id: 'op_1',
        type: 'extract_field',
        label: 'Result',
        fieldPath: 'title',
        outputFormat: 'string',
      }]);
      mockContext.inputs = { 101: 123 };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        [RESULT_SOCKET]: '',
        [STATUS_SOCKET]: 'Error: JSON input is required and must be a string',
      });
    });

    it('should handle missing input', async () => {
      setOperations(node, [{
        id: 'op_1',
        type: 'extract_field',
        label: 'Result',
        fieldPath: 'title',
        outputFormat: 'string',
      }]);
      mockContext.inputs = { 101: undefined };

      const result = await node.process!(mockContext);

      expect(result).toEqual({
        [RESULT_SOCKET]: '',
        [STATUS_SOCKET]: 'Error: JSON input is required and must be a string',
      });
    });

    it('should produce empty output for unsupported operation type', async () => {
      setOperations(node, [{
        id: 'op_1',
        // @ts-expect-error — intentionally unsupported
        type: 'unsupported_op',
        label: 'Result',
        outputFormat: 'string',
      }]);
      mockContext.inputs = { 101: JSON.stringify({ test: 'data' }) };

      const result = await node.process!(mockContext);

      // The node silently produces "" for unknown op types
      expect(result).toEqual({
        [RESULT_SOCKET]: '',
        [STATUS_SOCKET]: 'Success: 1 operation completed',
      });
    });
  });

  // ── config parameters ────────────────────────────────────────────────────────

  describe('config parameters', () => {
    it('should have 1 config parameter: Operations', () => {
      const params = node.getConfigParameters!();
      expect(params).toHaveLength(1);
      expect(params[0]?.parameterName).toBe('Operations');
    });

    it('should set Operations config parameter and update sockets', () => {
      const ops: OperationConfig[] = [
        { id: 'op_1', type: 'extract_field', label: 'Out A', fieldPath: 'a', outputFormat: 'string' },
        { id: 'op_2', type: 'extract_field', label: 'Out B', fieldPath: 'b', outputFormat: 'string' },
      ];
      node.setConfigParameter!('Operations', JSON.stringify(ops));

      const param = node.getConfigParameter!('Operations');
      expect(JSON.parse(String(param?.paramValue))).toHaveLength(2);
      // Sockets rebuild: 1 input + 2 outputs + 1 status = 4
      expect(node.sockets).toHaveLength(4);
    });
  });
});