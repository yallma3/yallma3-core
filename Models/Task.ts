export interface TaskSocket {
  id: number;
  title: string;
  type: "input" | "output";
}

export interface Task {
  id: string;
  title: string;
  description: string;
  expectedOutput: string;
  type: string;
  executorId: string;
  position: string;
  selected: boolean;
  sockets: TaskSocket[];
}

export interface TaskConnection {
  fromSocket: number;
  toSocket: number;
}

export interface TaskGraph {
  tasks: Task[];
  connections: TaskConnection[];
}

export type InterpretedTask = {
  taskId: string;
  intent: string;
  entities: string[];
  execution: {
    executorType: string;
    executorId?: string | null;
  };
  context: {
    inputs: string[];
    external?: string;
  };
  classification: "simple" | "one_tool_call" | "complex";
  formatForNext?: string;
  decomposition?: boolean;
};

export type InterpretationResult = {
  interpretedTasks: InterpretedTask[];
};

export type SubTask = {
  id: string;
  title: string;
  description: string;
  expectedOutput: string;
};

export type AgentStep = {
  id: string;
  action: string;
  rationale: string;
  expectedOutput: string;
};

export type CoreTaskAnalysis = {
  taskId: string;
  intent: string; // LLM-friendly rewritten version
  classification: "simple" | "one_tool_call" | "complex";
  needsDecomposition: boolean;
  userInput: string | null; // e.g. "websearch", "api call", or null
};

export interface Layer {
  taskId: string;
  context: string[];
}
