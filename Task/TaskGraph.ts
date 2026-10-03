import type { Layer, TaskGraph } from "../Models/Task";
import { buildLayeredTopoSort } from "../Execution/toposort";

export function buildTaskExecutionLayers(taskGraph: TaskGraph): string[][] {
  const { tasks, connections } = taskGraph;
  if (tasks.length === 0) {
    throw new Error("No tasks found. Your task flow needs at least one task to execute.");
  }

  const socketToTask = new Map<number, string>();
  for (const task of tasks) {
    for (const socket of task.sockets) {
      socketToTask.set(socket.id, task.id);
    }
  }

  const edges: { fromId: string; toId: string }[] = [];
  for (const conn of connections) {
    const fromTask = socketToTask.get(conn.fromSocket);
    const toTask = socketToTask.get(conn.toSocket);
    if (fromTask && toTask && fromTask !== toTask) {
      edges.push({ fromId: fromTask, toId: toTask });
    }
  }

  return buildLayeredTopoSort(tasks, edges);
}

export function buildLayersWithContext(taskGraph: TaskGraph): Layer[][] {
  const { tasks, connections } = taskGraph;
  if (tasks.length === 0) {
    throw new Error("No tasks found. Your task flow needs at least one task to execute.");
  }

  const socketToTask = new Map<number, string>();
  for (const task of tasks) {
    for (const socket of task.sockets) {
      socketToTask.set(socket.id, task.id);
    }
  }

  const edges: { fromId: string; toId: string }[] = [];
  const contextMap = new Map<string, Set<string>>();
  for (const task of tasks) {
    contextMap.set(task.id, new Set());
  }
  for (const conn of connections) {
    const fromTask = socketToTask.get(conn.fromSocket);
    const toTask = socketToTask.get(conn.toSocket);
    if (fromTask && toTask && fromTask !== toTask) {
      edges.push({ fromId: fromTask, toId: toTask });
      contextMap.get(toTask)!.add(fromTask);
    }
  }

  const layers = buildLayeredTopoSort(tasks, edges);
  return layers.map(layer =>
    layer.map(taskId => ({
      taskId,
      context: Array.from(contextMap.get(taskId) || []),
    }))
  );
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
