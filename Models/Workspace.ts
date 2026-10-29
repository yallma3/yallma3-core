import type { Task, TaskConnection } from "./Task";
import type { Agent } from "./Agent";
import type { Workflow } from "./Workflow";
import type { LLMOption } from "./LLM";

export interface WorkspaceData {
  id: string;
  createdAt: number;
  updatedAt: number;
  // Step 1: workspace Basics
  name: string;
  description: string;
  // Step 2: LLM Selection
  mainLLM: LLMOption;
  apiKey: string;
  useSavedCredentials: boolean;

  // Step 3: Tasks
  tasks: Task[];
  connections: TaskConnection[];

  // Step 4: Agents
  agents: Agent[];

  // Workflows
  workflows: Workflow[];
}

export interface ConsoleEvent {
  id: string;
  timestamp: number;
  type: "info" | "warning" | "error" | "success" | "system" | "input" | "user";
  message: string;
  details?: string;
  results?: string;
}
