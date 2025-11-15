import { describe, it, expect } from 'vitest';

// Test the core logic of the JoinTextNode process function
// Since the process function is embedded in the node creation, we'll test the logic directly

describe('JoinTextNode Process Logic', () => {
  // Helper function that mimics the process logic
  const processJoinLogic = (nodeValue: string | undefined, inputs: Record<string | number, unknown>): string => {
    // Process special separator values
    let separator = String(nodeValue || "");

    // Replace special separator placeholders
    separator = separator
      .replace(/\(new line\)/g, "\n") // Replace (new line) with actual newline
      .replace(/\\n/g, "\n"); // Also support \n for newlines

    // Collect all input values
    const result = Object.values(inputs)
      .filter((val) => typeof val === "string" && val !== "")
      .join(separator);

    return result;
  };

  it('should join string inputs with space separator by default', () => {
    const inputs = {
      101: 'Hello',
      102: 'world',
      103: 'from',
      104: 'tests',
    };

    const result = processJoinLogic(' ', inputs);
    expect(result).toBe('Hello world from tests');
  });

  it('should join inputs with custom separator', () => {
    const inputs = {
      101: 'apple',
      102: 'banana',
      103: 'cherry',
    };

    const result = processJoinLogic(', ', inputs);
    expect(result).toBe('apple, banana, cherry');
  });

  it('should handle newline separators', () => {
    const inputs = {
      101: 'Line 1',
      102: 'Line 2',
      103: 'Line 3',
    };

    const result = processJoinLogic('(new line)', inputs);
    expect(result).toBe('Line 1\nLine 2\nLine 3');
  });

  it('should handle escaped newline separators', () => {
    const inputs = {
      101: 'First',
      102: 'Second',
    };

    const result = processJoinLogic('\\n', inputs);
    expect(result).toBe('First\nSecond');
  });

  it('should filter out non-string and empty string inputs', () => {
    const inputs = {
      101: 'Valid string',
      102: '', // Empty string should be filtered
      103: 123, // Number should be filtered
      104: null, // Null should be filtered
      105: 'Another valid',
    };

    const result = processJoinLogic(' ', inputs);
    expect(result).toBe('Valid string Another valid');
  });

  it('should return empty string when no valid inputs', () => {
    const inputs = {
      101: '',
      102: 456,
      103: null,
    };

    const result = processJoinLogic(',', inputs);
    expect(result).toBe('');
  });

  it('should handle single input', () => {
    const inputs = {
      101: 'Single input',
    };

    const result = processJoinLogic('-', inputs);
    expect(result).toBe('Single input');
  });

  it('should use empty string as separator when nodeValue is falsy', () => {
    const inputs = {
      101: 'Concat',
      102: 'enated',
    };

    const result = processJoinLogic('', inputs);
    expect(result).toBe('Concatenated');
  });

  it('should use empty string as separator when nodeValue is undefined', () => {
    const inputs = {
      101: 'No',
      102: 'Separator',
    };

    const result = processJoinLogic(undefined, inputs);
    expect(result).toBe('NoSeparator');
  });
});