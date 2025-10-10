import type { Workflow } from "../../Models/Workflow";
import { nodeRegistry } from "../NodeRegistry";
import type { BaseNode } from "../types/types";

export function buildExecutionLayers(workflow: Workflow): number[][] {
  const { nodes, connections } = workflow;
  if (nodes.length === 0) {
    const error =
      "No nodes found. Your flow needs at least one node to execute.";
    throw new Error(error);
  }

  // Map socketId -> nodeId
  const socketToNode = new Map<number, number>();
  for (const node of nodes) {
    for (const socket of node.sockets) {
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

/**
 * Instantiate runtime node objects for all nodes defined in a workflow.
 *
 * Missing node coordinates default to 0 when creating the runtime node.
 *
 * @returns An array of hydrated `BaseNode` instances that combine the created runtime node properties with the original node data.
 * @throws Error if no factory is registered for a node's `nodeType`.
 */
export function hydrateWorkflowNodes(workflow: Workflow): BaseNode[] {
  return workflow.nodes.map((nodeData) => {
    const factory = nodeRegistry.getFactory(nodeData.nodeType);
    if (!factory)
      throw new Error(`No factory for node type: ${nodeData.nodeType}`);

    // create base node
    return {
      ...factory(nodeData.id, { x: nodeData.x ?? 0, y: nodeData.y ?? 0 }),
      ...nodeData,
    };
  });
}