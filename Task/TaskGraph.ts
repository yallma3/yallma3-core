import type { Layer, TaskGraph } from "../Models/Task";

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

export function buildLayersWithContext(taskGraph: TaskGraph): Layer[][] {
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
  const layers: Layer[][] = [];
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

// Utility function to get task execution order as a flat array
export function getTaskExecutionOrder(taskGraph: TaskGraph): string[] {
  const layers = buildTaskExecutionLayers(taskGraph);
  return layers.flat();
}

// Utility function to get task execution order as a flat array
export function getTaskExecutionOrderWithContext(
  taskGraph: TaskGraph
): Layer[] {
  const layers = buildLayersWithContext(taskGraph);
  return layers.flat();
}

// Utility function to check if a task can be executed (all dependencies completed)
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
