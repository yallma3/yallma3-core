import type { Agent } from "./Agent";

export interface AgentMemoryRecord {
  agentId: string;
  name: string;
  role: string;
  objective: string;
  background: string;
  llm: { provider: string; model: string; modelId?: string };
  tools: string[];
  successes: number;
  failures: number;
  capabilities: string[];
  updatedAt: number;
  createdAt: number;
}

export interface AgentMemoryStore {
  recordOutcome(agent: Agent, success: boolean): void;
  addCapabilities(agentId: string, tags: string[]): void;
  removeCapabilities(agentId: string, tags: string[]): void;
  getAgent(agentId: string): AgentMemoryRecord | undefined;
  queryByCapability(tag: string): AgentMemoryRecord[];
  getAll(): AgentMemoryRecord[];
}
