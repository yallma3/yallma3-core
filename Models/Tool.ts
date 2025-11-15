

export type Tool = {
  id?: string;
  type: "function" | "workflow" | "mcp" | "basic";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export interface LLMSpecTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  executor?: (args: Record<string, unknown>) => Promise<unknown> | unknown; // optional actual function
}

export interface ToolExecutor {
  execute(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

export class ToolHandler implements ToolExecutor {
  private registry = new Map<
    string,
    (input: Record<string, unknown>) => Promise<unknown>
  >();

  register(name: string, fn: (input: Record<string, unknown>) => Promise<unknown>) {
    this.registry.set(name, fn);
  }

  async execute(toolName: string, input: Record<string, unknown>) {
    const fn = this.registry.get(toolName);
    if (!fn) throw new Error(`No tool registered with name ${toolName}`);
    return fn(input);
  }
}
