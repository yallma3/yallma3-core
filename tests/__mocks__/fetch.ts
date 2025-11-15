/**
 * Mock utilities for fetch API testing
 */

export interface MockResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
}

export class FetchMock {
  private calls: Array<{
    url: string;
    options: RequestInit;
    response: MockResponse;
  }> = [];

  mockResponse(urlPattern: string | RegExp, response: MockResponse) {
    // This is a simple implementation - in a real scenario you'd want more sophisticated matching
    this.calls.push({
      url: typeof urlPattern === 'string' ? urlPattern : urlPattern.source,
      options: {},
      response,
    });
  }

  getLastCall() {
    return this.calls[this.calls.length - 1];
  }

  reset() {
    this.calls = [];
  }
}

export const createMockResponse = (
  data: unknown,
  ok = true,
  status = 200
): MockResponse => ({
  ok,
  status,
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

export const createErrorResponse = (
  status = 500,
  message = 'Internal Server Error'
): MockResponse => ({
  ok: false,
  status,
  json: () => Promise.reject(new Error(message)),
  text: () => Promise.resolve(message),
});