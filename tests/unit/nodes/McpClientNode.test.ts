import { describe, it, expect, vi, beforeEach } from "vitest";
import { register } from "../../../Workflow/Nodes/Mcp/McpClientNode";
import { NodeRegistry } from "../../../Workflow/NodeRegistry";
import type { NodeExecutionContext } from "../../../Workflow/types/types";
import type { McpClientNode } from "../../../Workflow/Nodes/Mcp/McpClientNode";
import type { ExecutionContext } from "../../../Execution/ExecutionContext";

const mockInit = vi.fn();
const mockClose = vi.fn();
const mockCallTool = vi.fn();
const mockListTools = vi.fn();

vi.mock("../../../Utils/McpHttpClient", () => ({
  McpHttpClient: vi.fn().mockImplementation(() => ({
    init: mockInit,
    close: mockClose,
    callTool: mockCallTool,
    listTools: mockListTools,
  })),
}));

vi.mock("../../../Utils/McpStdioClient", () => ({
  McpSTDIOClient: vi.fn().mockImplementation(() => ({
    init: mockInit,
    close: mockClose,
    callTool: mockCallTool,
    listTools: mockListTools,
  })),
}));

describe("McpClientNode", () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new NodeRegistry();
    register(registry);
  });

  function createMockExecutionContext(node: McpClientNode, inputs: Record<number, unknown> = {}): NodeExecutionContext {
    const mockCtx: ExecutionContext = {
      requestId: "test-req",
      send: vi.fn(),
      onMessage: vi.fn(),
      onClose: vi.fn(() => () => {}),
      broadcast: vi.fn(),
    };

    return {
      node,
      inputs,
      ctx: mockCtx,
    } as unknown as NodeExecutionContext;
  }

  it("registers in NodeRegistry with category MCP and type McpClient", () => {
    const types = registry.listNodeTypes();
    expect(types).toContain("McpClient");

    const factory = registry.getFactory("McpClient");
    expect(factory).toBeDefined();

    const node = factory!(1, { x: 10, y: 20 }) as McpClientNode;
    expect(node.nodeType).toBe("McpClient");
    expect(node.id).toBe(1);
    expect(node.sockets).toHaveLength(2);
  });

  it("successfully invokes an MCP tool and returns output on success socket", async () => {
    const factory = registry.getFactory("McpClient")!;
    const node = factory(1, { x: 0, y: 0 }) as McpClientNode;

    node.setConfigParameter("Selection Mode", "manual");
    node.setConfigParameter("Capability Type", "tool");
    node.setConfigParameter("Transport Type", "http");
    node.setConfigParameter("MCP Server URL", "http://localhost:3000/sse");
    node.setConfigParameter("Tool Name", "calculate");

    mockInit.mockResolvedValue(undefined);
    mockCallTool.mockResolvedValue({ result: 42 });
    mockClose.mockResolvedValue(undefined);

    const execContext = createMockExecutionContext(node, {
      101: JSON.stringify({ a: 1, b: 2 }),
    });

    const result = await node.process(execContext);

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockCallTool).toHaveBeenCalledWith({
      tool: "calculate",
      input: { a: 1, b: 2 },
    });
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      102: JSON.stringify({ result: 42 }, null, 2),
    });
  });

  it("throws Error on transport connection failure and ensures client is closed", async () => {
    const factory = registry.getFactory("McpClient")!;
    const node = factory(2, { x: 0, y: 0 }) as McpClientNode;

    node.setConfigParameter("Selection Mode", "manual");
    node.setConfigParameter("Capability Type", "tool");
    node.setConfigParameter("Transport Type", "http");
    node.setConfigParameter("MCP Server URL", "http://localhost:3003/sse");
    node.setConfigParameter("Tool Name", "read_email");

    mockInit.mockRejectedValue(new Error("SSE error: Unable to connect"));
    mockClose.mockResolvedValue(undefined);

    const execContext = createMockExecutionContext(node);

    await expect(node.process(execContext)).rejects.toThrow("SSE error: Unable to connect");
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("throws Error when tool name is not configured and no input provided", async () => {
    const factory = registry.getFactory("McpClient")!;
    const node = factory(3, { x: 0, y: 0 }) as McpClientNode;

    node.setConfigParameter("Selection Mode", "manual");
    node.setConfigParameter("Capability Type", "tool");
    node.setConfigParameter("Transport Type", "http");
    node.setConfigParameter("MCP Server URL", "http://localhost:3000/sse");
    node.setConfigParameter("Tool Name", "");

    mockInit.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);

    const execContext = createMockExecutionContext(node);

    await expect(node.process(execContext)).rejects.toThrow(
      'Tool Name is not configured. Open the node panel, click "Choose..." to connect and pick a tool.'
    );
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("throws Error when input JSON is invalid", async () => {
    const factory = registry.getFactory("McpClient")!;
    const node = factory(4, { x: 0, y: 0 }) as McpClientNode;

    node.setConfigParameter("Selection Mode", "manual");
    node.setConfigParameter("Capability Type", "tool");
    node.setConfigParameter("Transport Type", "http");
    node.setConfigParameter("MCP Server URL", "http://localhost:3000/sse");
    node.setConfigParameter("Tool Name", "calculate");

    mockInit.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);

    const execContext = createMockExecutionContext(node, {
      401: "{ invalid json here",
    });

    await expect(node.process(execContext)).rejects.toThrow("Input JSON is invalid");
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("throws Error on unknown capability type", async () => {
    const factory = registry.getFactory("McpClient")!;
    const node = factory(5, { x: 0, y: 0 }) as McpClientNode;

    node.setConfigParameter("Selection Mode", "manual");
    node.setConfigParameter("Capability Type", "unsupported");
    node.setConfigParameter("Transport Type", "http");
    node.setConfigParameter("MCP Server URL", "http://localhost:3000/sse");

    mockInit.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);

    const execContext = createMockExecutionContext(node);

    await expect(node.process(execContext)).rejects.toThrow("Unknown Capability Type: unsupported");
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
