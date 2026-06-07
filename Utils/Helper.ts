type JsonParseSuccess<T> = { success: true; data: T };
type JsonParseFailure = { success: false; error: string };
type JsonParseResult<T> = JsonParseSuccess<T> | JsonParseFailure;

type Reviver = (key: string, value: unknown) => unknown;

const SMART_APOS = /[\u2018\u2019]/g;
const SMART_DQUOTES = /[\u201c\u201d]/g;
const TRAILING_COMMA = /,\s*([}\]])/g;
const UNQUOTED_KEY = /([{, ])\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g;
const CODE_BLOCK = /```(?:json)?\s*([\s\S]*?)\s*```/;
const JSON_LIKE_BLOCK = /^\s*[[{].*[}\]]\s*$/s;
const SINGLE_QUOTED_VALUE = /:\s*'(.*?)'(?=\s*[,}\]])/g;
const SINGLE_QUOTED_KEY = /'([a-zA-Z_$][a-zA-Z0-9_$]*)'\s*:/g;

function extractJsonContent(raw: string): string {
  const match = CODE_BLOCK.exec(raw);
  if (match?.[1]) {
    return match[1].trim();
  }
  return raw.trim();
}

function aggressiveRepair(raw: string): string {
  let s = raw;
  s = s.replace(SMART_APOS, "'");
  s = s.replace(SMART_DQUOTES, '"');
  s = s.replace(TRAILING_COMMA, '$1');
  s = s.replace(SINGLE_QUOTED_KEY, '"$1":');
  s = s.replace(SINGLE_QUOTED_VALUE, ': "$1"');
  s = s.replace(UNQUOTED_KEY, '$1 "$2":');
  return s;
}

function safeJsonParse<T = unknown>(raw: string, reviver?: Reviver): JsonParseResult<T> {
  try {
    const data = JSON.parse(raw, reviver as Parameters<typeof JSON.parse>[1]) as T;
    if (data === null || typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
      return { success: false, error: `JSON value is a primitive, expected object or array` };
    }
    return { success: true, data };
  } catch {
    return { success: false, error: `Invalid JSON` };
  }
}

export class Helper {
  static JsonParser = class JsonParser {
    static safeParse<T = unknown>(raw: string, reviver?: Reviver): JsonParseResult<T> {
      const extracted = extractJsonContent(raw);
      const normalized = extracted.normalize('NFKC');

      const fast = safeJsonParse<T>(normalized, reviver);
      if (fast.success) return fast;

      if (!JSON_LIKE_BLOCK.test(normalized)) {
        return { success: false, error: `Input does not contain valid JSON: ${normalized.slice(0, 200)}` };
      }

      const repaired = aggressiveRepair(normalized);

      return safeJsonParse<T>(repaired, reviver);
    }

    static parse<T = unknown>(raw: string, reviver?: Reviver): T {
      const result = JsonParser.safeParse<T>(raw, reviver);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    }

    static parseWithFallback<T>(raw: string, fallback: T, reviver?: Reviver): T {
      const result = JsonParser.safeParse<T>(raw, reviver);
      return result.success ? result.data : fallback;
    }
  };
}
