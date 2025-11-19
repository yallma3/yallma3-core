import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import mcpRouter from "../../../Routes/Mcp.route";

// Mock the MCP clients
const mockStdioClient = {
  init: vi.fn().mockResolvedValue(undefined),
  test: vi.fn().mockResolvedValue(true),
  listTools: vi.fn().mockResolvedValue([{ name: 'test-tool', description: 'A test tool' }]),
  listPrompts: vi.fn().mockResolvedValue([{ name: 'test-prompt', description: 'A test prompt' }]),
  listResources: vi.fn().mockResolvedValue([{ uri: 'test://resource', name: 'Test Resource' }]),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockHttpClient = {
  init: vi.fn().mockResolvedValue(undefined),
  test: vi.fn().mockResolvedValue(true),
  listTools: vi.fn().mockResolvedValue([{ name: 'http-tool', description: 'An HTTP tool' }]),
  listPrompts: vi.fn().mockResolvedValue([{ name: 'http-prompt', description: 'An HTTP prompt' }]),
  listResources: vi.fn().mockResolvedValue([{ uri: 'http://resource', name: 'HTTP Resource' }]),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../../Utils/McpStdioClient', () => ({
  McpSTDIOClient: vi.fn().mockImplementation(() => mockStdioClient),
}));

vi.mock('../../../Utils/McpHttpClient', () => ({
  McpHttpClient: vi.fn().mockImplementation(() => mockHttpClient),
}));

describe("MCP Routes", () => {
  let app: express.Application;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/api/mcp", mcpRouter);
    server = app.listen(0);
  });

  afterAll(() => {
    server.close();
  });

  describe("POST /api/mcp/health", () => {
    it("should return health status for STDIO type", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'STDIO',
          command: 'test-command',
          args: ['arg1']
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { status: string; type: string };
      expect(data).toHaveProperty('status', 'ok');
      expect(data).toHaveProperty('type', 'STDIO');
    });

    it("should return health status for HTTP type", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'HTTP',
          url: 'http://test-server.com'
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { status: string; type: string };
      expect(data).toHaveProperty('status', 'ok');
      expect(data).toHaveProperty('type', 'HTTP');
    });

    it("should return 400 for missing config", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data).toHaveProperty('error');
    });

    it("should return 400 for unsupported type", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'UNSUPPORTED' })
      });

      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data).toHaveProperty('error');
    });
  });

  describe("POST /api/mcp/connect", () => {
    it("should connect and return tools/prompts/resources for STDIO", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'STDIO',
          command: 'test-command',
          args: ['arg1']
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { tools: unknown[]; prompts: unknown[]; resources: unknown[] };
      expect(data).toHaveProperty('tools');
      expect(data).toHaveProperty('prompts');
      expect(data).toHaveProperty('resources');
      expect(Array.isArray(data.tools)).toBe(true);
      expect(Array.isArray(data.prompts)).toBe(true);
      expect(Array.isArray(data.resources)).toBe(true);
    });

    it("should connect and return tools/prompts/resources for HTTP", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'HTTP',
          url: 'http://test-server.com'
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { tools: unknown[]; prompts: unknown[]; resources: unknown[] };
      expect(data).toHaveProperty('tools');
      expect(data).toHaveProperty('prompts');
      expect(data).toHaveProperty('resources');
    });

    it("should return 400 for missing config", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data).toHaveProperty('error');
    });

    it("should return 400 for missing type", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'test' })
      });

      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data).toHaveProperty('error');
    });

    it("should return 400 for unsupported type", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'UNSUPPORTED' })
      });

      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data).toHaveProperty('error');
    });

    it("should return 400 for STDIO missing command", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'STDIO',
          args: ['arg1']
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data).toHaveProperty('error');
    });

    it("should return 400 for HTTP missing url", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'HTTP'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data).toHaveProperty('error');
    });
  });

  describe("GET /api/mcp/http/tools", () => {
    it("should return tools from HTTP MCP server", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/http/tools?serverUrl=http://test-server.com`);

      expect(response.status).toBe(200);
      const data = await response.json() as { tools: unknown[] };
      expect(data).toHaveProperty('tools');
      expect(Array.isArray(data.tools)).toBe(true);
    });

    it("should return 400 for missing serverUrl", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/http/tools`);

      expect(response.status).toBe(400);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await response.json() as any;
      expect(data).toHaveProperty('error');
    });
  });

  describe("GET /api/mcp/http/prompts", () => {
    it("should return prompts from HTTP MCP server", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/http/prompts?serverUrl=http://test-server.com`);

      expect(response.status).toBe(200);
      const data = await response.json() as { prompts: unknown[] };
      expect(data).toHaveProperty('prompts');
      expect(Array.isArray(data.prompts)).toBe(true);
    });
  });

  describe("GET /api/mcp/http/resources", () => {
    it("should return resources from HTTP MCP server", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/http/resources?serverUrl=http://test-server.com`);

      expect(response.status).toBe(200);
      const data = await response.json() as { resources: unknown[] };
      expect(data).toHaveProperty('resources');
      expect(Array.isArray(data.resources)).toBe(true);
    });
  });

  describe("POST /api/mcp/stdio/connect", () => {
    it("should connect to STDIO MCP server", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/stdio/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'test-command',
          args: ['arg1']
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { tools: unknown[]; prompts: unknown[]; resources: unknown[] };
      expect(data).toHaveProperty('tools');
      expect(data).toHaveProperty('prompts');
      expect(data).toHaveProperty('resources');
    });

    it("should return 400 for missing command", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/stdio/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(400);
      const data = await response.json() as { error: string };
      expect(data).toHaveProperty('error');
    });
  });

  describe("POST /api/mcp/stdio/tools", () => {
    it("should return tools from STDIO MCP server", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/stdio/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'test-command',
          args: ['arg1']
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { tools: unknown[] };
      expect(data).toHaveProperty('tools');
      expect(Array.isArray(data.tools)).toBe(true);
    });
  });

  describe("POST /api/mcp/stdio/prompts", () => {
    it("should return prompts from STDIO MCP server", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/stdio/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'test-command',
          args: ['arg1']
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { prompts: unknown[] };
      expect(data).toHaveProperty('prompts');
      expect(Array.isArray(data.prompts)).toBe(true);
    });
  });

  describe("POST /api/mcp/stdio/resources", () => {
    it("should return resources from STDIO MCP server", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/mcp/stdio/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'test-command',
          args: ['arg1']
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { resources: unknown[] };
      expect(data).toHaveProperty('resources');
      expect(Array.isArray(data.resources)).toBe(true);
    });
  });
});