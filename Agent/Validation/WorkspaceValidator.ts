export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: ValidationError };

function error(path: string, message: string, code: string): ValidationResult {
  return { valid: false, error: { path, message, code } };
}

export function validateLLMOption(llm: unknown, path: string): ValidationResult {
  if (!llm || typeof llm !== "object") {
    return error(path, "LLM option is missing or invalid", "INVALID_LLM");
  }
  const opt = llm as Record<string, unknown>;
  if (!opt.provider || typeof opt.provider !== "string") {
    return error(`${path}.provider`, "LLM provider is missing or empty", "INVALID_LLM");
  }
  if (!opt.model || typeof opt.model !== "object") {
    return error(`${path}.model`, "LLM model is missing or invalid", "INVALID_LLM");
  }
  return { valid: true };
}

export function validateTask(
  task: unknown,
  index: number,
  workflows: unknown[],
  agents: unknown[],
): ValidationResult {
  if (!task || typeof task !== "object") {
    return error(`tasks[${index}]`, "Task is missing or invalid", "MISSING_FIELD");
  }
  const t = task as Record<string, unknown>;
  if (!t.id || typeof t.id !== "string") {
    return error(`tasks[${index}].id`, "Task id is missing or empty", "MISSING_FIELD");
  }
  if (!t.title || typeof t.title !== "string") {
    return error(`tasks[${index}].title`, "Task title is missing or empty", "MISSING_FIELD");
  }
  if (!t.type || typeof t.type !== "string") {
    return error(`tasks[${index}].type`, "Task type is missing or empty", "MISSING_FIELD");
  }
  const validTypes = ["agentic", "workflow", "specific-agent"];
  if (!validTypes.includes(t.type as string)) {
    return error(
      `tasks[${index}].type`,
      `Task type '${String(t.type)}' is invalid. Must be one of: ${validTypes.join(", ")}`,
      "INVALID_ENUM",
    );
  }
  if (t.type === "workflow") {
    const executorId = t.executorId as string | undefined;
    if (!executorId) {
      return error(`tasks[${index}].executorId`, "Workflow task is missing executorId", "MISSING_FIELD");
    }
    const found = (workflows as Array<Record<string, unknown>>).some(
      (w) => w.id === executorId,
    );
    if (!found) {
      return error(
        `tasks[${index}].executorId`,
        `Workflow executor '${executorId}' does not match any workflow id`,
        "INVALID_REFERENCE",
      );
    }
  }
  if (t.type === "specific-agent") {
    const executorId = t.executorId as string | undefined;
    if (!executorId) {
      return error(`tasks[${index}].executorId`, "Agent task is missing executorId", "MISSING_FIELD");
    }
    const found = (agents as Array<Record<string, unknown>>).some(
      (a) => a.id === executorId,
    );
    if (!found) {
      return error(
        `tasks[${index}].executorId`,
        `Agent executor '${executorId}' does not match any agent id`,
        "INVALID_REFERENCE",
      );
    }
  }
  return { valid: true };
}

export function validateTasks(
  tasks: unknown,
  workflows: unknown[],
  agents: unknown[],
): ValidationResult {
  if (!Array.isArray(tasks)) {
    return error("tasks", "Tasks must be an array", "MISSING_FIELD");
  }
  for (let i = 0; i < tasks.length; i++) {
    const result = validateTask(tasks[i], i, workflows, agents);
    if (!result.valid) return result;
  }
  return { valid: true };
}

export function validateTaskConnections(
  tasks: unknown[],
  connections: unknown[],
): ValidationResult {
  if (!Array.isArray(connections)) {
    return error("connections", "Connections must be an array", "MISSING_FIELD");
  }
  if (!Array.isArray(tasks)) {
    return error("tasks", "Tasks must be an array", "MISSING_FIELD");
  }
  const socketToTask = new Map<number, { taskId: string; taskIndex: number }>();
  for (let ti = 0; ti < tasks.length; ti++) {
    const t = tasks[ti] as Record<string, unknown> | undefined;
    if (!t || typeof t !== "object") continue;
    const taskId = t.id as string;
    const sockets = t.sockets as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(sockets)) {
      for (const s of sockets) {
        const sid = s.id as number;
        if (typeof sid !== "number") continue;
        socketToTask.set(sid, { taskId, taskIndex: ti });
      }
    }
  }
  for (let ci = 0; ci < connections.length; ci++) {
    const conn = connections[ci] as Record<string, unknown> | undefined;
    if (!conn || typeof conn !== "object") {
      return error(
        `connections[${ci}]`,
        "Connection is invalid",
        "MISSING_FIELD",
      );
    }
    const fromSocket = conn.fromSocket as number;
    const toSocket = conn.toSocket as number;
    const fromTask = typeof fromSocket === "number" ? socketToTask.get(fromSocket) : undefined;
    const toTask = typeof toSocket === "number" ? socketToTask.get(toSocket) : undefined;
    if (typeof fromSocket === "number" && !fromTask) {
      return error(
        `connections[${ci}].fromSocket`,
        `Connection references socket ${fromSocket} which does not exist on any task`,
        "INVALID_REFERENCE",
      );
    }
    if (typeof toSocket === "number" && !toTask) {
      return error(
        `connections[${ci}].toSocket`,
        `Connection references socket ${toSocket} which does not exist on any task`,
        "INVALID_REFERENCE",
      );
    }
    if (fromTask && toTask && fromTask.taskId === toTask.taskId) {
      return error(
        `connections[${ci}]`,
        `Connection connects task '${fromTask.taskId}' to itself; cross-task connections are required`,
        "SELF_CONNECTION",
      );
    }
  }
  return { valid: true };
}

export function validateAgent(agent: unknown, index: number): ValidationResult {
  if (!agent || typeof agent !== "object") {
    return error(`agents[${index}]`, "Agent is missing or invalid", "MISSING_FIELD");
  }
  const a = agent as Record<string, unknown>;
  if (!a.id || typeof a.id !== "string") {
    return error(`agents[${index}].id`, "Agent id is missing or empty", "MISSING_FIELD");
  }
  if (!a.role || typeof a.role !== "string") {
    return error(`agents[${index}].role`, `Agent '${String(a.id)}' is missing a role`, "MISSING_FIELD");
  }
  if (!a.background || typeof a.background !== "string") {
    return error(
      `agents[${index}].background`,
      `Agent '${String(a.id)}' is missing a background description`,
      "MISSING_FIELD",
    );
  }
  if (!a.llm) {
    return error(
      `agents[${index}].llm`,
      `Agent '${String(a.id)}' is missing an LLM configuration`,
      "INVALID_LLM",
    );
  }
  return { valid: true };
}

export function validateAgents(agents: unknown): ValidationResult {
  if (!Array.isArray(agents)) {
    return error("agents", "Agents must be an array", "MISSING_FIELD");
  }
  for (let i = 0; i < agents.length; i++) {
    const result = validateAgent(agents[i], i);
    if (!result.valid) return result;
  }
  return { valid: true };
}

export function validateWorkflow(workflow: unknown, index: number): ValidationResult {
  if (!workflow || typeof workflow !== "object") {
    return error(`workflows[${index}]`, "Workflow is missing or invalid", "MISSING_FIELD");
  }
  const w = workflow as Record<string, unknown>;
  if (!w.id || typeof w.id !== "string") {
    return error(`workflows[${index}].id`, "Workflow id is missing or empty", "MISSING_FIELD");
  }
  if (!w.name || typeof w.name !== "string") {
    return error(`workflows[${index}].name`, "Workflow name is missing or empty", "MISSING_FIELD");
  }
  const nodes = w.nodes as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(nodes)) {
    return error(`workflows[${index}].nodes`, "Workflow nodes must be an array", "MISSING_FIELD");
  }
  if (nodes.length === 0) {
    return { valid: true };
  }
  const allSocketIds = new Set<number>();
  const nodeSocketIds = new Map<number, Set<number>>();
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni];
    if (!node || typeof node !== "object") {
      return error(`workflows[${index}].nodes[${ni}]`, "Node is missing or invalid", "MISSING_FIELD");
    }
    if (typeof node.id !== "number") {
      return error(`workflows[${index}].nodes[${ni}].id`, "Node id must be a number", "MISSING_FIELD");
    }
    const sockets = node.sockets as Array<Record<string, unknown>> | undefined;
    const sidSet = new Set<number>();
    if (Array.isArray(sockets)) {
      for (const s of sockets) {
        if (typeof s.id === "number") {
          allSocketIds.add(s.id);
          sidSet.add(s.id);
        }
      }
    }
    nodeSocketIds.set(node.id as number, sidSet);
  }
  const connections = w.connections as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(connections)) {
    for (let ci = 0; ci < connections.length; ci++) {
      const conn = connections[ci];
      if (!conn || typeof conn !== "object") {
        return error(`workflows[${index}].connections[${ci}]`, "Connection is invalid", "MISSING_FIELD");
      }
      const fromSocket = conn.fromSocket as number;
      const toSocket = conn.toSocket as number;
      if (fromSocket !== undefined && !allSocketIds.has(fromSocket)) {
        return error(
          `workflows[${index}].connections[${ci}].fromSocket`,
          `Connection references socket ${fromSocket} which does not exist in workflow '${String(w.id)}'`,
          "INVALID_REFERENCE",
        );
      }
      if (toSocket !== undefined && !allSocketIds.has(toSocket)) {
        return error(
          `workflows[${index}].connections[${ci}].toSocket`,
          `Connection references socket ${toSocket} which does not exist in workflow '${String(w.id)}'`,
          "INVALID_REFERENCE",
        );
      }
    }
    for (const [nid, sids] of nodeSocketIds) {
      if (sids.size > 0) {
        const hasConnection = (connections as Array<Record<string, unknown>>).some(
          (c) =>
            (c.fromSocket !== undefined && sids.has(c.fromSocket as number)) ||
            (c.toSocket !== undefined && sids.has(c.toSocket as number)),
        );
        if (!hasConnection) {
          return error(
            `workflows[${index}].nodes`,
            `Node ${nid} in workflow '${String(w.id)}' has sockets but no connections reference them (orphan node)`,
            "ORPHAN_NODE",
          );
        }
      }
    }
  }
  return { valid: true };
}

export function validateWorkflows(workflows: unknown): ValidationResult {
  if (!Array.isArray(workflows)) {
    return error("workflows", "Workflows must be an array", "MISSING_FIELD");
  }
  for (let i = 0; i < workflows.length; i++) {
    const result = validateWorkflow(workflows[i], i);
    if (!result.valid) return result;
  }
  return { valid: true };
}

export function validateWorkspace(data: unknown): ValidationResult {
  if (!data || typeof data !== "object") {
    return error("root", "Workspace data must be a non-null object", "MISSING_FIELD");
  }
  const ws = data as Record<string, unknown>;
  if (!ws.id || typeof ws.id !== "string") {
    return error("id", "Workspace id is missing or empty", "MISSING_FIELD");
  }
  if (!ws.name || typeof ws.name !== "string") {
    return error("name", "Workspace name is missing or empty", "MISSING_FIELD");
  }
  const tasks = ws.tasks;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return error("tasks", "Workspace must have at least one task", "EMPTY_COLLECTION");
  }
  const resultLLM = validateLLMOption(ws.mainLLM, "mainLLM");
  if (!resultLLM.valid) return resultLLM;
  const connections = ws.connections ?? [];
  const workflows = ws.workflows ?? [];
  const agents = ws.agents ?? [];
  const resultTasks = validateTasks(tasks, workflows as Array<Record<string, unknown>>, agents as Array<Record<string, unknown>>);
  if (!resultTasks.valid) return resultTasks;
  const resultTaskConnections = validateTaskConnections(tasks as Array<Record<string, unknown>>, connections as Array<Record<string, unknown>>);
  if (!resultTaskConnections.valid) return resultTaskConnections;
  const resultAgents = validateAgents(agents);
  if (!resultAgents.valid) return resultAgents;
  const resultWorkflows = validateWorkflows(workflows);
  if (!resultWorkflows.valid) return resultWorkflows;
  return { valid: true };
}
