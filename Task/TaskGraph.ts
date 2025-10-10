import type { Layer, TaskGraph } from "../Models/Task";

/**
 * Produce topologically ordered execution layers of task IDs from the provided task graph.
 *
 * Each returned layer is an array of task IDs that have no unresolved dependencies within the same layer;
 * all dependencies for tasks in a layer appear in earlier layers. The first layer contains tasks with no inputs.
 *
 * @param taskGraph - Graph containing `tasks` (with `id` and `sockets`) and `connections` (with `fromSocket` and `toSocket`) used to derive edges.
 * @returns An array of layers; each layer is an array of task IDs representing a concurrent execution group in topological order.
 * @throws Error if `taskGraph.tasks` is empty.
 * @throws Error if a cycle is detected in the task workflow graph.
 */
export function buildTaskExecutionLayers(taskGraph: TaskGraph): string[][] {
  const { tasks, connections } = taskGraph;

  if (tasks.length === 0) {
    throw new Error(
      "No tasks found. Your task flow needs at least one task to execute."
    );
  }

  // Map socketId -> taskId
  const socketToTask = new Map<number, string>();
  for (const task of tasks) {
    for (const socket of task.sockets) {
      socketToTask.set(socket.id, task.id);
    }
  }

  // Build adjacency list and indegree count
  const adjList = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();

  // Initialize all tasks
  for (const task of tasks) {
    indegree.set(task.id, 0);
    adjList.set(task.id, new Set());
  }

  // Build graph from connections
  for (const conn of connections) {
    const fromTask = socketToTask.get(conn.fromSocket);
    const toTask = socketToTask.get(conn.toSocket);

    if (fromTask && toTask && fromTask !== toTask) {
      if (!adjList.get(fromTask)?.has(toTask)) {
        adjList.get(fromTask)!.add(toTask);
        indegree.set(toTask, (indegree.get(toTask) || 0) + 1);
      }
    }
  }

  // Layered topological sort
  const layers: string[][] = [];
  let currentLayer: string[] = [];

  // Start with tasks that have no dependencies (indegree 0)
  for (const [taskId, deg] of indegree.entries()) {
    if (deg === 0) {
      currentLayer.push(taskId);
    }
  }

  while (currentLayer.length > 0) {
    layers.push([...currentLayer]);

    const nextLayer: string[] = [];
    for (const taskId of currentLayer) {
      // Process all tasks that depend on current task
      for (const dependentTask of adjList.get(taskId) || []) {
        indegree.set(dependentTask, (indegree.get(dependentTask) || 0) - 1);
        if (indegree.get(dependentTask) === 0) {
          nextLayer.push(dependentTask);
        }
      }
    }
    currentLayer = nextLayer;
  }

  // Detect cycles
  const totalVisited = layers.flat().length;
  if (totalVisited !== tasks.length) {
    throw new Error("Cycle detected in task workflow graph!");
  }

  return layers;
}

/**
 * Produce layered execution groups where each task lists its predecessor task IDs.
 *
 * @param taskGraph - The task graph containing `tasks` (with sockets) and `connections` that define dependencies.
 * @returns An array of layers; each layer is an array of objects `{ taskId, context }` where `context` is an array of predecessor task IDs.
 * @throws If `taskGraph.tasks` is empty.
 * @throws If a cycle is detected in the task graph.
 */
export function buildLayersWithContext(
  taskGraph: TaskGraph
): { taskId: string; context: string[] }[][] {
  const { tasks, connections } = taskGraph;

  if (tasks.length === 0) {
    throw new Error(
      "No tasks found. Your task flow needs at least one task to execute."
    );
  }

  // Map socketId -> taskId
  const socketToTask = new Map<number, string>();
  for (const task of tasks) {
    for (const socket of task.sockets) {
      socketToTask.set(socket.id, task.id);
    }
  }

  // Build adjacency list, indegree, and reverse mapping for context
  const adjList = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  const contextMap = new Map<string, Set<string>>();

  // Initialize all tasks
  for (const task of tasks) {
    indegree.set(task.id, 0);
    adjList.set(task.id, new Set());
    contextMap.set(task.id, new Set());
  }

  // Build graph from connections
  for (const conn of connections) {
    const fromTask = socketToTask.get(conn.fromSocket);
    const toTask = socketToTask.get(conn.toSocket);

    if (fromTask && toTask && fromTask !== toTask) {
      if (!adjList.get(fromTask)?.has(toTask)) {
        adjList.get(fromTask)!.add(toTask);
        indegree.set(toTask, (indegree.get(toTask) || 0) + 1);
        contextMap.get(toTask)!.add(fromTask);
      }
    }
  }

  // Layered topological sort
  const layers: { taskId: string; context: string[] }[][] = [];
  let currentLayer: string[] = [];

  // Start with tasks that have no dependencies (indegree 0)
  for (const [taskId, deg] of indegree.entries()) {
    if (deg === 0) {
      currentLayer.push(taskId);
    }
  }

  while (currentLayer.length > 0) {
    layers.push(
      currentLayer.map((taskId) => ({
        taskId,
        context: Array.from(contextMap.get(taskId) || []),
      }))
    );

    const nextLayer: string[] = [];
    for (const taskId of currentLayer) {
      // Process all tasks that depend on current task
      for (const dependentTask of adjList.get(taskId) || []) {
        indegree.set(dependentTask, (indegree.get(dependentTask) || 0) - 1);
        if (indegree.get(dependentTask) === 0) {
          nextLayer.push(dependentTask);
        }
      }
    }
    currentLayer = nextLayer;
  }

  // Detect cycles
  const totalVisited = layers.flat().length;
  if (totalVisited !== tasks.length) {
    throw new Error("Cycle detected in task workflow graph!");
  }

  return layers;
}

/**
 * Produce a flat execution order of task ids for a task graph.
 *
 * @param taskGraph - The TaskGraph containing tasks and connections used to derive execution order
 * @returns An array of task ids in execution order
 */
export function getTaskExecutionOrder(taskGraph: TaskGraph): string[] {
  const layers = buildTaskExecutionLayers(taskGraph);
  return layers.flat();
}

/**
 * Produce a flat execution sequence of tasks where each entry includes its predecessor context.
 *
 * @param taskGraph - The TaskGraph containing tasks and their connections
 * @returns An array of `Layer` entries (objects with `taskId` and `context`), flattened in execution order
 */
export function getTaskExecutionOrderWithContext(
  taskGraph: TaskGraph
): Layer[] {
  const layers = buildLayersWithContext(taskGraph);
  return layers.flat();
}

/**
 * Determines whether a task's input dependencies are satisfied given a set of completed tasks.
 *
 * @param taskId - The id of the task to check.
 * @param taskGraph - The task graph containing tasks and connections.
 * @param completedTasks - Set of task ids that have already completed; used to evaluate dependency fulfillment.
 * @returns `true` if every input socket of the task has either no incoming connection or is provided by a task in `completedTasks`; `false` if a required dependency is not completed or the task with `taskId` is not found.
 */
export function canExecuteTask(
  taskId: string,
  taskGraph: TaskGraph,
  completedTasks: Set<string>
): boolean {
  const { tasks, connections } = taskGraph;

  // Find all input sockets for this task
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return false;

  const inputSockets = task.sockets.filter((s) => s.type === "input");

  // Check if all input dependencies are satisfied
  for (const inputSocket of inputSockets) {
    const dependencyConnection = connections.find(
      (c) => c.toSocket === inputSocket.id
    );
    if (dependencyConnection) {
      // Find which task provides this input
      const dependencyTask = tasks.find((t) =>
        t.sockets.some((s) => s.id === dependencyConnection.fromSocket)
      );

      if (dependencyTask && !completedTasks.has(dependencyTask.id)) {
        return false; // Dependency not completed yet
      }
    }
  }

  return true;
}