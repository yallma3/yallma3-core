export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
}

export interface ServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  alwaysAllow?: string[];
}
