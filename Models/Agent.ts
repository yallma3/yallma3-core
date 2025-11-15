import type { LLMOption } from "./LLM";
import type { Tool } from "./Tool";

// Interfaces for workspace data structure
export interface Agent {
  id: string;
  name: string;
  role: string;
  objective: string;
  background: string;
  capabilities: string;
  tools: Tool[];
  llm: LLMOption; // ID of the LLM to use for this agent
  apiKey: string;
  variables?: Record<string, string>; // Variables for templating in background and other fields
}

export interface ReviewResult {
  isValid: boolean;
  feedback: string;
  isComplete: boolean;
}
