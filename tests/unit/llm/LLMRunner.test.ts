import { describe, it, expect, vi, afterEach } from 'vitest';
import { executeWithFallback, FatalMainLLMError, testLLMHealth } from '../../../LLM/LLMRunner';
import type { LLMOption } from '../../../Models/LLM';

interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

const model = {
  id: 'test-model',
  name: 'Test Model',
  contextWindow: { input: 1000, output: 1000 },
};

const ollamaOption: LLMOption = { provider: 'Ollama', model };
const openaiOption: LLMOption = { provider: 'OpenAI', model };
const anthropicOption: LLMOption = { provider: 'Anthropic', model };
const geminiOption: LLMOption = { provider: 'Gemini', model };

function mockFetch(impl: (url: string, init?: FetchInit) => Promise<unknown>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('testLLMHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Ollama', () => {
    it('returns ok for a reachable Ollama via GET /api/tags', async () => {
      const fetchMock = mockFetch(() => Promise.resolve({ ok: true, status: 200 }));

      await expect(testLLMHealth(ollamaOption, '')).resolves.toEqual({ ok: true });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:11434/api/tags');
    });

    it('respects a custom base URL from llmOption.options?.baseUrl', async () => {
      const fetchMock = mockFetch(() => Promise.resolve({ ok: true, status: 200 }));

      await testLLMHealth(
        { ...ollamaOption, options: { baseUrl: 'http://10.0.0.5:11434' } },
        ''
      );

      expect(fetchMock.mock.calls[0]![0]).toBe('http://10.0.0.5:11434/api/tags');
    });

    it('returns an error when /api/tags responds 404', async () => {
      mockFetch(() => Promise.resolve({ ok: false, status: 404 }));

      await expect(testLLMHealth(ollamaOption, '')).resolves.toEqual({
        ok: false,
        error: 'Ollama /api/tags returned 404',
      });
    });

    it('returns a timeout/network error when fetch throws', async () => {
      mockFetch(() => Promise.reject(new Error('ECONNREFUSED')));

      await expect(testLLMHealth(ollamaOption, '')).resolves.toEqual({
        ok: false,
        error: 'network error: ECONNREFUSED',
      });
    });
  });

  describe('OpenAI-compatible providers', () => {
    it.each([
      ['OpenAI', 'https://api.openai.com/v1/chat/completions'],
      ['Groq', 'https://api.groq.com/openai/v1/chat/completions'],
      ['OpenRouter', 'https://openrouter.ai/api/v1/chat/completions'],
    ] as const)('probes %s at the correct endpoint with max_tokens 1', async (provider, endpoint) => {
      const fetchMock = mockFetch(() => Promise.resolve({ ok: true, status: 200 }));

      await expect(
        testLLMHealth({ provider, model }, 'sk-test')
      ).resolves.toEqual({ ok: true });

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(endpoint);
      expect(init?.headers?.Authorization).toBe('Bearer sk-test');
      expect(JSON.parse(String(init?.body)).max_tokens).toBe(1);
    });

    it('returns an error on an OpenAI 401 response', async () => {
      mockFetch(() => Promise.resolve({ ok: false, status: 401 }));

      await expect(testLLMHealth(openaiOption, 'bad-key')).resolves.toEqual({
        ok: false,
        error: 'OpenAI probe returned 401',
      });
    });
  });

  describe('Anthropic', () => {
    it('sends the required headers and max_tokens 1', async () => {
      const fetchMock = mockFetch(() => Promise.resolve({ ok: true, status: 200 }));

      await expect(testLLMHealth(anthropicOption, 'ak-test')).resolves.toEqual({ ok: true });

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(init?.headers?.['x-api-key']).toBe('ak-test');
      expect(init?.headers?.['anthropic-version']).toBe('2023-06-01');
      expect(JSON.parse(String(init?.body)).max_tokens).toBe(1);
    });
  });

  describe('Gemini', () => {
    it('probes generateContent with the query key and maxOutputTokens 1', async () => {
      const fetchMock = mockFetch(() => Promise.resolve({ ok: true, status: 200 }));

      await expect(testLLMHealth(geminiOption, 'gk-test')).resolves.toEqual({ ok: true });

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent?key=gk-test'
      );
      expect(JSON.parse(String(init?.body)).generationConfig.maxOutputTokens).toBe(1);
    });
  });

  describe('timeout', () => {
    it('returns a timeout error when the request is aborted', async () => {
      mockFetch(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'TimeoutError';
              reject(err);
            });
          })
      );

      // Real timers + small timeout — AbortSignal.timeout is not driven by vi.useFakeTimers
      await expect(testLLMHealth(openaiOption, 'sk-test', 50)).resolves.toEqual({
        ok: false,
        error: 'timeout after 50ms',
      });
    });

    it('respects a custom timeoutMs (returns well under the 8000ms default)', async () => {
      mockFetch(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          })
      );

      const started = Date.now();
      const result = await testLLMHealth(openaiOption, 'sk-test', 50);
      const elapsed = Date.now() - started;

      expect(result.ok).toBe(false);
      expect(elapsed).toBeLessThan(1000);
    });
  });
});

describe('executeWithFallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const nodeOption: LLMOption = { provider: 'Groq', model };
  const mainOption: LLMOption = { provider: 'OpenAI', model };
  const messages = [{ role: 'user' as const, content: 'hello' }];

  const nodeLLM = { option: nodeOption, apiKey: 'node-key' };
  const mainLLM = { option: mainOption, apiKey: 'main-key' };

  function okResponse(content: string) {
    return {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ choices: [{ message: { content, tool_calls: null } }] }),
    };
  }

  it('returns the node LLM result without ever invoking the Main LLM', async () => {
    const fetchMock = mockFetch(() => Promise.resolve(okResponse('from node')));

    const result = await executeWithFallback({
      nodeLLM,
      mainLLM,
      messages,
      workflowId: 'wf-1',
    });

    expect(result.content).toBe('from node');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://api.groq.com/openai/v1/chat/completions'
    );
  });

  it('falls back to the Main LLM when the node LLM fails, logging a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = mockFetch((url) => {
      if (url.includes('api.groq.com')) return Promise.reject(new Error('node down'));
      return Promise.resolve(okResponse('from main'));
    });

    const result = await executeWithFallback({
      nodeLLM,
      mainLLM,
      messages,
      workflowId: 'wf-2',
    });

    expect(result.content).toBe('from main');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0]).toBe(
      'https://api.openai.com/v1/chat/completions'
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Node LLM failed'),
      expect.anything()
    );
  });

  it('throws FatalMainLLMError when both the node and Main LLM fail', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch(() => Promise.reject(new Error('everything down')));

    await expect(
      executeWithFallback({ nodeLLM, mainLLM, messages, workflowId: 'wf-3' })
    ).rejects.toBeInstanceOf(FatalMainLLMError);
  });

  it('calls the Main LLM directly when no node LLM is configured', async () => {
    const fetchMock = mockFetch(() => Promise.resolve(okResponse('main only')));

    const result = await executeWithFallback({
      mainLLM,
      messages,
      workflowId: 'wf-4',
    });

    expect(result.content).toBe('main only');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://api.openai.com/v1/chat/completions'
    );
  });
});
