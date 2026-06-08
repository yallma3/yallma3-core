import { describe, it, expect } from 'vitest';
import { Helper } from '../../../Utils/Helper';

const { JsonParser } = Helper;

describe('Helper.JsonParser', () => {
  describe('safeParse', () => {
    it('parses valid JSON', () => {
      const result = JsonParser.safeParse('{"a": 1, "b": "hello"}');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ a: 1, b: 'hello' });
      }
    });

    it('parses valid JSON array', () => {
      const result = JsonParser.safeParse('[1, 2, 3]');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([1, 2, 3]);
      }
    });

    it('returns failure for non-JSON input', () => {
      const result = JsonParser.safeParse('not json at all');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('does not contain valid JSON');
      }
    });

    it('returns failure for empty string', () => {
      const result = JsonParser.safeParse('');
      expect(result.success).toBe(false);
    });

    it('returns failure for null', () => {
      const result = JsonParser.safeParse('null');
      expect(result.success).toBe(false);
    });

    it('returns failure for just a number', () => {
      const result = JsonParser.safeParse('42');
      expect(result.success).toBe(false);
    });

    it('returns failure for just a string', () => {
      const result = JsonParser.safeParse('"hello"');
      expect(result.success).toBe(false);
    });
  });

  describe('markdown removal', () => {
    it('strips ```json code block', () => {
      const input = '```json\n{"key": "value"}\n```';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: 'value' });
      }
    });

    it('strips ``` code block without language', () => {
      const input = '```\n{"key": "value"}\n```';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: 'value' });
      }
    });

    it('strips leading/following text', () => {
      const input = 'Here is the result:\n```json\n{"key": "value"}\n```\nHope that helps.';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: 'value' });
      }
    });
  });

  describe('Unicode normalization', () => {
    it('normalizes Unicode characters (NFKC)', () => {
      const decomposed = '{"key": "a\u0300"}';
      const result = JsonParser.safeParse(decomposed);
      expect(result.success).toBe(true);
      if (result.success) {
        const val = (result.data as Record<string, string>).key;
        expect(val.normalize('NFC')).toBe(val);
      }
    });

    it('normalizes fullwidth characters', () => {
      const input = '{"key": "\uff34\uff45\uff53\uff54"}';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: 'Test' });
      }
    });
  });

  describe('trailing commas', () => {
    it('removes trailing comma in object', () => {
      const input = '{"a": 1, "b": 2,}';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ a: 1, b: 2 });
      }
    });

    it('removes trailing comma in array', () => {
      const input = '[1, 2, 3,]';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([1, 2, 3]);
      }
    });

    it('removes trailing comma in nested structures', () => {
      const input = '{"a": [1, 2,], "b": {"c": 3,},}';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ a: [1, 2], b: { c: 3 } });
      }
    });
  });

  describe('smart quotes', () => {
    it('replaces smart double quotes with straight double quotes', () => {
      const input = '{\u201ckey\u201d: \u201cvalue\u201d}';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: 'value' });
      }
    });

    it('replaces smart single quotes with straight quotes and repairs', () => {
      const input = "{\u2018key\u2019: \u2018value\u2019}";
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: 'value' });
      }
    });
  });

  describe('unquoted keys', () => {
    it('quotes unquoted object keys', () => {
      const input = '{key: "value"}';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: 'value' });
      }
    });

    it('quotes multiple unquoted keys', () => {
      const input = '{a: 1, b: "hello"}';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ a: 1, b: 'hello' });
      }
    });

    it('quotes unquoted keys in nested objects', () => {
      const input = '{outer: {inner: 42}}';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ outer: { inner: 42 } });
      }
    });

    it('handles keys with underscores and dollar signs', () => {
      const input = '{_key: 1, $pecial: 2}';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ _key: 1, $pecial: 2 });
      }
    });
  });

  describe('single-quoted values', () => {
    it('converts single-quoted string values to double-quoted', () => {
      const input = '{"a": \'hello\'}';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ a: 'hello' });
      }
    });

    it('handles multiple single-quoted values', () => {
      const input = '{"a": \'hello\', "b": \'world\'}';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ a: 'hello', b: 'world' });
      }
    });
  });

  describe('combined repairs', () => {
    it('handles unquoted keys + trailing commas + smart quotes', () => {
      const input = '{\u201ckey\u201d: \u201cvalue\u201d,}';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ key: 'value' });
      }
    });

    it('handles markdown + trailing comma + unquoted keys', () => {
      const input = '```json\n{name: "test", count: 3,}\n```';
      const result = JsonParser.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ name: 'test', count: 3 });
      }
    });
  });

  describe('parse (throwing version)', () => {
    it('returns data on success', () => {
      const data = JsonParser.parse('{"a": 1}');
      expect(data).toEqual({ a: 1 });
    });

    it('throws on failure', () => {
      expect(() => JsonParser.parse('not json')).toThrow();
    });
  });

  describe('parseWithFallback', () => {
    it('returns parsed object on valid JSON', () => {
      const result = JsonParser.parseWithFallback('{"a": 1}', null);
      expect(result).toEqual({ a: 1 });
    });

    it('returns fallback for invalid JSON', () => {
      const fallback = { default: true };
      const result = JsonParser.parseWithFallback('invalid json', fallback);
      expect(result).toEqual(fallback);
    });

    it('returns fallback for primitive JSON like null', () => {
      const result = JsonParser.parseWithFallback('null', 'fallback');
      expect(result).toBe('fallback');
    });
  });

  describe('reviver parameter', () => {
    it('applies reviver in safeParse', () => {
      const reviver = (key: string, value: unknown) => {
        if (key === 'date' && typeof value === 'string') {
          return new Date(value);
        }
        return value;
      };
      const result = JsonParser.safeParse('{"date": "2024-01-01"}', reviver);
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>).date).toBeInstanceOf(Date);
      }
    });

    it('applies reviver in parse', () => {
      const reviver = (_key: string, value: unknown) =>
        typeof value === 'string' ? value.toUpperCase() : value;
      const data = JsonParser.parse('{"name": "hello"}', reviver);
      expect(data).toEqual({ name: 'HELLO' });
    });

    it('applies reviver in parseWithFallback', () => {
      const reviver = (_key: string, value: unknown) =>
        typeof value === 'number' ? value * 2 : value;
      const result = JsonParser.parseWithFallback('{"count": 5}', null, reviver);
      expect(result).toEqual({ count: 10 });
    });
  });
});
