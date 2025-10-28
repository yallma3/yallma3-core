import type WebSocket from "ws";
import { workflowExecutor } from "../Agent/Utls/ToolCallingHelper";

export type Tool = {
  id?: string;
  type: "function" | "workflow" | "mcp" | "basic";
  name: string;
  description: string;
  parameters: Record<string, any>;
};

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, any>;
};

export interface LLMSpecTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, any>;
  executor?: (args: any) => Promise<any> | any; // optional actual function
}

export interface ToolExecutor {
  execute(toolName: string, args: Record<string, any>): Promise<any>;
}

export class ToolHandler implements ToolExecutor {
  private registry = new Map<
    string,
    (input: Record<string, any>) => Promise<any>
  >();

  register(name: string, fn: (input: Record<string, any>) => Promise<any>) {
    this.registry.set(name, fn);
  }

  async execute(toolName: string, input: Record<string, any>) {
    const fn = this.registry.get(toolName);
    if (!fn) throw new Error(`No tool registered with name ${toolName}`);
    return fn(input);
  }
}
