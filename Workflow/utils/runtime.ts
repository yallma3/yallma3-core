import type { Workflow } from "../../Models/Workflow";
import { nodeRegistry } from "../NodeRegistry";
import type { BaseNode } from "../types/types";

export function buildExecutionLayers(workflow: Workflow): number[][] {
  const { nodes, connections } = workflow;
  if (nodes.length === 0) {
    throw new Error("No nodes found. Your flow needs at least one node to execute.");
  }

  // Map socketId -> nodeId
  const socketToNode = new Map<number, number>();
  for (const node of nodes) {
    const factory = nodeRegistry.getFactory(node.nodeType);
    const freshSockets = factory
      ? factory(node.id, { x: 0, y: 0 }).sockets
      : node.sockets;
    for (const socket of freshSockets) {
      socketToNode.set(socket.id, node.id);
    }
  }

  // Build adjacency + indegree
  const adjList = new Map<number, Set<number>>();
  const indegree = new Map<number, number>();

  for (const node of nodes) {
    indegree.set(node.id, 0);
    adjList.set(node.id, new Set());
  }

  for (const conn of connections) {
    const fromNode = socketToNode.get(conn.fromSocket);
    const toNode = socketToNode.get(conn.toSocket);
    if (fromNode && toNode && fromNode !== toNode) {
      if (!adjList.get(fromNode)?.has(toNode)) {
        adjList.get(fromNode)!.add(toNode);
        indegree.set(toNode, (indegree.get(toNode) || 0) + 1);
      }
    }
  }

  // Layered topo sort
  const layers: number[][] = [];
  let currentLayer: number[] = [];

    // Start with indegree 0
  for (const [nodeId, deg] of indegree.entries()) {
    if (deg === 0) currentLayer.push(nodeId);
  }

  while (currentLayer.length > 0) {
    layers.push(currentLayer);

    const nextLayer: number[] = [];
    for (const node of currentLayer) {
      for (const neighbor of adjList.get(node) || []) {
        indegree.set(neighbor, (indegree.get(neighbor) || 0) - 1);
        if (indegree.get(neighbor) === 0) {
          nextLayer.push(neighbor);
        }
      }
    }
    currentLayer = nextLayer;
  }

    // detect cycles
  const totalVisited = layers.flat().length;
  if (totalVisited !== nodes.length) {
    throw new Error("Cycle detected in workflow graph!");
  }

  return layers;
}

export function hydrateWorkflowNodes(workflow: Workflow): BaseNode[] {
  return workflow.nodes.map((nodeData) => {
    const factory = nodeRegistry.getFactory(nodeData.nodeType);
    if (!factory)
      throw new Error(`No factory for node type: ${nodeData.nodeType}`);

    // create base node
    const freshNode = factory(nodeData.id, { x: nodeData.x ?? 0, y: nodeData.y ?? 0 });

    return {
      ...freshNode,
      ...nodeData,
      sockets: freshNode.sockets, 
    };
  });
}

export function remapConnections(
  workflow: Workflow
): Array<{ fromSocket: number; toSocket: number }> {
  type Direction = "input" | "output";

  const savedSocketInfo = new Map<
    number,
    { nodeId: number; direction: Direction; index: number }
  >();
  const freshSocketId = new Map<string, number>();

  for (const node of workflow.nodes) {
    const factory = nodeRegistry.getFactory(node.nodeType);
    const freshSockets = factory
      ? factory(node.id, { x: 0, y: 0 }).sockets
      : node.sockets;

    // Index saved sockets by direction order
    const savedByDir: Record<Direction, number[]> = { input: [], output: [] };
    for (const s of node.sockets) {
      savedByDir[s.type as Direction].push(s.id);
    }
    for (const dir of ["input", "output"] as Direction[]) {
      savedByDir[dir].forEach((id, idx) => {
        savedSocketInfo.set(id, { nodeId: node.id, direction: dir, index: idx });
      });
    }

    // Index fresh sockets by direction order
    const freshByDir: Record<Direction, number[]> = { input: [], output: [] };
    for (const s of freshSockets) {
      freshByDir[s.type as Direction].push(s.id);
    }
    for (const dir of ["input", "output"] as Direction[]) {
      freshByDir[dir].forEach((id, idx) => {
        freshSocketId.set(`${node.id}:${dir}:${idx}`, id);
      });
    }
  }

  return workflow.connections.map((conn) => {
    const fromInfo = savedSocketInfo.get(conn.fromSocket);
    const toInfo = savedSocketInfo.get(conn.toSocket);

    const newFrom = fromInfo
      ? freshSocketId.get(`${fromInfo.nodeId}:${fromInfo.direction}:${fromInfo.index}`) ?? conn.fromSocket
      : conn.fromSocket;

    const newTo = toInfo
      ? freshSocketId.get(`${toInfo.nodeId}:${toInfo.direction}:${toInfo.index}`) ?? conn.toSocket
      : conn.toSocket;

    return { fromSocket: newFrom, toSocket: newTo };
  });
}