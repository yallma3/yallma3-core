// Interfaces for workspace data structure
export interface Agent {
  id: string;
  name: string;
  role: string;
  objective: string;
  background: string;
  capabilities: string;
  tools: ToolConfig[];
  llmId: string; // ID of the LLM to use for this agent
  apiKey: string,
  variables?: Record<string, string>; // Variables for templating in background and other fields
}

export interface ToolConfig {
  name: string;
  isInputChannel: boolean;
  isOutputProducer: boolean;
  isJudge: boolean;
}
