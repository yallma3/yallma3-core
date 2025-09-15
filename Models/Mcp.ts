export interface ToolCall {
    tool: string;
    input: Record<string, any>;
}

export interface ServerConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    disabled?: boolean;
    alwaysAllow?: string[];
}