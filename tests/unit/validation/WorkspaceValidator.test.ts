import { describe, it, expect } from "vitest";
import {
  validateWorkspace,
  validateLLMOption,
  validateTask,
  validateTasks,
  validateTaskConnections,
  validateAgent,
  validateAgents,
  validateWorkflow,
  validateWorkflows,
} from "../../../Agent/Validation/WorkspaceValidator";
import type { WorkspaceData } from "../../../Models/Workspace";

function validWorkspace(overrides?: Partial<WorkspaceData>): WorkspaceData {
  return {
    id: "ws-1",
    name: "Test Workspace",
    description: "A test workspace",
    createdAt: 1000,
    updatedAt: 2000,
    mainLLM: { provider: "OpenAI", model: { id: "gpt-4", name: "GPT-4" } },
    apiKey: "sk-123",
    useSavedCredentials: false,
    tasks: [
      {
        id: "task-1",
        title: "Test Task",
        description: "A test task",
        expectedOutput: "output",
        type: "agentic",
        executorId: "",
        position: "0",
        selected: true,
        sockets: [],
      },
    ],
    connections: [],
    agents: [
      {
        id: "agent-1",
        name: "Test Agent",
        role: "Assistant",
        objective: "Help",
        background: "An AI assistant",
        capabilities: "general",
        tools: [],
        llm: { provider: "OpenAI", model: { id: "gpt-4", name: "GPT-4" } },
        apiKey: "sk-456",
      },
    ],
    workflows: [
      {
        id: "wf-1",
        name: "Test Workflow",
        description: "A test workflow",
        nodes: [],
        connections: [],
      },
    ],
    ...overrides,
  };
}

describe("validateLLMOption", () => {
  it("passes for a valid LLMOption", () => {
    const llm = { provider: "OpenAI", model: { id: "gpt-4", name: "GPT-4" } };
    expect(validateLLMOption(llm, "mainLLM")).toEqual({ valid: true });
  });

  it("fails for null input", () => {
    const result = validateLLMOption(null, "mainLLM");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("INVALID_LLM");
  });

  it("fails for non-object input", () => {
    const result = validateLLMOption("string", "mainLLM");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("INVALID_LLM");
  });

  it("fails when provider is missing", () => {
    const result = validateLLMOption({ model: { id: "gpt-4" } }, "mainLLM");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("INVALID_LLM");
      expect(result.error.path).toBe("mainLLM.provider");
    }
  });

  it("fails when model is missing", () => {
    const result = validateLLMOption({ provider: "OpenAI" }, "mainLLM");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("INVALID_LLM");
      expect(result.error.path).toBe("mainLLM.model");
    }
  });
});

describe("validateTask", () => {
  const emptyWorkflows: unknown[] = [];
  const emptyAgents: unknown[] = [];

  it("passes for a valid task", () => {
    const task = {
      id: "t-1",
      title: "Task",
      type: "agentic",
      executorId: "",
      sockets: [],
    };
    expect(validateTask(task, 0, emptyWorkflows, emptyAgents)).toEqual({ valid: true });
  });

  it("fails for null task", () => {
    const result = validateTask(null, 0, emptyWorkflows, emptyAgents);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("fails when type is invalid enum", () => {
    const task = { id: "t-1", title: "Task", type: "invalid-type", sockets: [] };
    const result = validateTask(task, 0, emptyWorkflows, emptyAgents);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("INVALID_ENUM");
  });

  it("fails when workflow type has no executorId", () => {
    const task = { id: "t-1", title: "Task", type: "workflow", sockets: [] };
    const result = validateTask(task, 0, emptyWorkflows, emptyAgents);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("fails when workflow executorId does not match any workflow", () => {
    const task = { id: "t-1", title: "Task", type: "workflow", executorId: "wf-nonexistent", sockets: [] };
    const workflows = [{ id: "wf-1" }];
    const result = validateTask(task, 0, workflows, emptyAgents);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("INVALID_REFERENCE");
      expect(result.error.path).toBe("tasks[0].executorId");
    }
  });

  it("passes when workflow executorId matches a workflow", () => {
    const task = { id: "t-1", title: "Task", type: "workflow", executorId: "wf-1", sockets: [] };
    const workflows = [{ id: "wf-1" }];
    expect(validateTask(task, 0, workflows, emptyAgents)).toEqual({ valid: true });
  });

  it("fails when specific-agent executorId does not match any agent", () => {
    const task = { id: "t-1", title: "Task", type: "specific-agent", executorId: "agent-nonexistent", sockets: [] };
    const agents = [{ id: "agent-1" }];
    const result = validateTask(task, 0, emptyWorkflows, agents);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("INVALID_REFERENCE");
      expect(result.error.path).toBe("tasks[0].executorId");
    }
  });

  it("passes when specific-agent executorId matches an agent", () => {
    const task = { id: "t-1", title: "Task", type: "specific-agent", executorId: "agent-1", sockets: [] };
    const agents = [{ id: "agent-1" }];
    expect(validateTask(task, 0, emptyWorkflows, agents)).toEqual({ valid: true });
  });
});

describe("validateTasks", () => {
  it("passes for empty array when there are tasks elsewhere (handled by validateWorkspace pre-check)", () => {
    expect(validateTasks([], [], [])).toEqual({ valid: true });
  });

  it("fails for non-array input", () => {
    const result = validateTasks("not-array" as unknown as unknown[], [], []);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("short-circuits on first invalid task", () => {
    const tasks = [
      { id: "t-1", title: "Task 1", type: "agentic", sockets: [] },
      { id: "t-2", title: "Task 2", type: "invalid", sockets: [] },
      { id: "t-3", title: "Task 3", type: "agentic", sockets: [] },
    ];
    const result = validateTasks(tasks, [], []);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.path).toBe("tasks[1].type");
  });
});

describe("validateTaskConnections", () => {
  it("passes for empty connections", () => {
    expect(validateTaskConnections([], [])).toEqual({ valid: true });
  });

  it("fails for non-array connections", () => {
    const result = validateTaskConnections([], null as unknown as unknown[]);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("fails when fromSocket does not exist on any task", () => {
    const tasks = [
      { id: "t-1", sockets: [{ id: 1, title: "Out", type: "output" }] },
      { id: "t-2", sockets: [{ id: 2, title: "In", type: "input" }] },
    ];
    const connections = [{ fromSocket: 99, toSocket: 2 }];
    const result = validateTaskConnections(tasks, connections);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("INVALID_REFERENCE");
      expect(result.error.path).toBe("connections[0].fromSocket");
    }
  });

  it("fails when toSocket does not exist on any task", () => {
    const tasks = [
      { id: "t-1", sockets: [{ id: 1, title: "Out", type: "output" }] },
      { id: "t-2", sockets: [{ id: 2, title: "In", type: "input" }] },
    ];
    const connections = [{ fromSocket: 1, toSocket: 99 }];
    const result = validateTaskConnections(tasks, connections);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("INVALID_REFERENCE");
      expect(result.error.path).toBe("connections[0].toSocket");
    }
  });

  it("fails when connection is a self-loop (same task)", () => {
    const tasks = [
      { id: "t-1", sockets: [{ id: 1, title: "Out", type: "output" }, { id: 2, title: "In", type: "input" }] },
      { id: "t-2", sockets: [{ id: 3, title: "In", type: "input" }] },
    ];
    const connections = [{ fromSocket: 1, toSocket: 2 }];
    const result = validateTaskConnections(tasks, connections);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("SELF_CONNECTION");
      expect(result.error.path).toBe("connections[0]");
    }
  });

  it("passes for valid cross-task connection", () => {
    const tasks = [
      { id: "t-1", sockets: [{ id: 1, title: "Out", type: "output" }] },
      { id: "t-2", sockets: [{ id: 2, title: "In", type: "input" }] },
    ];
    const connections = [{ fromSocket: 1, toSocket: 2 }];
    expect(validateTaskConnections(tasks, connections)).toEqual({ valid: true });
  });

  it("passes for multiple valid cross-task connections", () => {
    const tasks = [
      { id: "t-1", sockets: [{ id: 1, title: "Out", type: "output" }] },
      { id: "t-2", sockets: [{ id: 2, title: "In", type: "input" }] },
      { id: "t-3", sockets: [{ id: 3, title: "In", type: "input" }] },
    ];
    const connections = [
      { fromSocket: 1, toSocket: 2 },
      { fromSocket: 1, toSocket: 3 },
    ];
    expect(validateTaskConnections(tasks, connections)).toEqual({ valid: true });
  });

  it("fails on invalid connection entry", () => {
    const tasks = [
      { id: "t-1", sockets: [{ id: 1, title: "Out", type: "output" }] },
      { id: "t-2", sockets: [{ id: 2, title: "In", type: "input" }] },
    ];
    const result = validateTaskConnections(tasks, [null as unknown as Record<string, unknown>]);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("MISSING_FIELD");
  });
});

describe("validateAgent", () => {
  it("passes for a valid agent", () => {
    const agent = {
      id: "a-1",
      role: "Assistant",
      background: "An AI",
      llm: { provider: "OpenAI", model: { id: "gpt-4" } },
    };
    expect(validateAgent(agent, 0)).toEqual({ valid: true });
  });

  it("fails for null agent", () => {
    const result = validateAgent(null, 0);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("fails when role is missing", () => {
    const result = validateAgent({ id: "a-1", background: "An AI" }, 0);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("MISSING_FIELD");
      expect(result.error.path).toBe("agents[0].role");
    }
  });

  it("fails when background is missing", () => {
    const result = validateAgent({ id: "a-1", role: "Assistant" }, 0);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("MISSING_FIELD");
      expect(result.error.path).toBe("agents[0].background");
    }
  });

  it("fails when llm is missing", () => {
    const result = validateAgent({ id: "a-1", role: "Assistant", background: "An AI" }, 0);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("INVALID_LLM");
      expect(result.error.path).toBe("agents[0].llm");
    }
  });
});

describe("validateAgents", () => {
  it("passes for empty array", () => {
    expect(validateAgents([])).toEqual({ valid: true });
  });

  it("fails for non-array input", () => {
    const result = validateAgents("not-array" as unknown);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("MISSING_FIELD");
  });
});

describe("validateWorkflow", () => {
  it("passes for a workflow with empty nodes (pending hydration)", () => {
    const wf = { id: "wf-1", name: "Test", nodes: [] };
    expect(validateWorkflow(wf, 0)).toEqual({ valid: true });
  });

  it("passes for a valid workflow with nodes and connections", () => {
    const wf = {
      id: "wf-1",
      name: "Test",
      nodes: [
        { id: 1, sockets: [{ id: 101, title: "Out", type: "output", nodeId: 1 }] },
        { id: 2, sockets: [{ id: 102, title: "In", type: "input", nodeId: 2 }] },
      ],
      connections: [{ fromSocket: 101, toSocket: 102 }],
    };
    expect(validateWorkflow(wf, 0)).toEqual({ valid: true });
  });

  it("fails for null workflow", () => {
    const result = validateWorkflow(null, 0);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("fails when nodes is missing", () => {
    const result = validateWorkflow({ id: "wf-1", name: "Test" }, 0);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("fails when connection references non-existent socket", () => {
    const wf = {
      id: "wf-1",
      name: "Test",
      nodes: [
        { id: 1, sockets: [{ id: 101, title: "Out", type: "output", nodeId: 1 }] },
      ],
      connections: [{ fromSocket: 999, toSocket: 101 }],
    };
    const result = validateWorkflow(wf, 0);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("INVALID_REFERENCE");
      expect(result.error.path).toContain("fromSocket");
    }
  });

  it("detects orphan node (sockets exist but no connection references them)", () => {
    const wf = {
      id: "wf-1",
      name: "Test",
      nodes: [
        { id: 1, sockets: [{ id: 101, title: "Out", type: "output", nodeId: 1 }] },
        { id: 2, sockets: [{ id: 102, title: "In", type: "input", nodeId: 2 }] },
      ],
      connections: [],
    };
    const result = validateWorkflow(wf, 0);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe("ORPHAN_NODE");
    }
  });
});

describe("validateWorkflows", () => {
  it("passes for empty array", () => {
    expect(validateWorkflows([])).toEqual({ valid: true });
  });

  it("fails for non-array input", () => {
    const result = validateWorkflows("not-array" as unknown);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("MISSING_FIELD");
  });
});

describe("validateWorkspace", () => {
  it("passes for a fully valid workspace", () => {
    expect(validateWorkspace(validWorkspace())).toEqual({ valid: true });
  });

  it("fails for null input", () => {
    const result = validateWorkspace(null);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("fails for non-object input", () => {
    const result = validateWorkspace("string");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("fails when id is missing", () => {
    const ws = validWorkspace({ id: "" });
    const result = validateWorkspace(ws);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.path).toBe("id");
      expect(result.error.code).toBe("MISSING_FIELD");
    }
  });

  it("fails when name is missing", () => {
    const ws = validWorkspace({ name: "" });
    const result = validateWorkspace(ws);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.path).toBe("name");
      expect(result.error.code).toBe("MISSING_FIELD");
    }
  });

  it("fails when tasks is empty", () => {
    const ws = validWorkspace({ tasks: [] });
    const result = validateWorkspace(ws);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.path).toBe("tasks");
      expect(result.error.code).toBe("EMPTY_COLLECTION");
    }
  });

  it("fails when mainLLM is invalid", () => {
    const ws = validWorkspace({ mainLLM: { provider: "", model: null } as unknown as WorkspaceData["mainLLM"] });
    const result = validateWorkspace(ws);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.path).toBe("mainLLM.provider");
      expect(result.error.code).toBe("INVALID_LLM");
    }
  });

  it("fails when task type is invalid", () => {
    const ws = validWorkspace();
    ws.tasks[0].type = "bad-type";
    const result = validateWorkspace(ws);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("INVALID_ENUM");
  });

  it("fails when agent role is missing", () => {
    const ws = validWorkspace();
    ws.agents[0].role = "";
    const result = validateWorkspace(ws);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("MISSING_FIELD");
  });

  it("passes when agents array is empty (agents are optional at workspace level)", () => {
    const ws = validWorkspace({ agents: [] });
    expect(validateWorkspace(ws)).toEqual({ valid: true });
  });

  it("passes when workflows array is empty", () => {
    const ws = validWorkspace({ workflows: [] });
    expect(validateWorkspace(ws)).toEqual({ valid: true });
  });

  it("passes with agentic task type (no executorId needed)", () => {
    const ws = validWorkspace();
    ws.tasks[0].type = "agentic";
    ws.tasks[0].executorId = "";
    expect(validateWorkspace(ws)).toEqual({ valid: true });
  });

  it("passes with workflow task referencing existing workflow", () => {
    const ws = validWorkspace();
    ws.tasks[0].type = "workflow";
    ws.tasks[0].executorId = "wf-1";
    expect(validateWorkspace(ws)).toEqual({ valid: true });
  });

  it("passes with specific-agent task referencing existing agent", () => {
    const ws = validWorkspace();
    ws.tasks[0].type = "specific-agent";
    ws.tasks[0].executorId = "agent-1";
    expect(validateWorkspace(ws)).toEqual({ valid: true });
  });

  it("fails with workflow task referencing non-existent workflow", () => {
    const ws = validWorkspace();
    ws.tasks[0].type = "workflow";
    ws.tasks[0].executorId = "wf-nonexistent";
    const result = validateWorkspace(ws);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error.code).toBe("INVALID_REFERENCE");
  });
});
