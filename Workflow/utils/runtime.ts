import type { Workflow } from "../../Models/Workflow";
import { nodeRegistry } from "../NodeRegistry";
import type { BaseNode } from "../types/types";
import { buildLayeredTopoSort } from "../../Execution/toposort";

export function buildExecutionLayers(workflow: Workflow): number[][] {
  const { nodes, connections } = workflow;
  if (nodes.length === 0) {
    throw new Error("No nodes found. Your flow needs at least one node to execute.");
  }

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

  const edges: { fromId: number; toId: number }[] = [];
  for (const conn of connections) {
    const fromNode = socketToNode.get(conn.fromSocket);
    const toNode = socketToNode.get(conn.toSocket);
    if (fromNode && toNode && fromNode !== toNode) {
      edges.push({ fromId: fromNode, toId: toNode });
    }
  }

  return buildLayeredTopoSort(nodes, edges);
}

export function hydrateWorkflowNodes(workflow: Workflow): BaseNode[] {
  return workflow.nodes.map((nodeData) => {
    const factory = nodeRegistry.getFactory(nodeData.nodeType);
    if (!factory)
      throw new Error(`No factory for node type: ${nodeData.nodeType}`);

    // create base node
    const freshNode = factory(nodeData.id, { x: nodeData.x ?? 0, y: nodeData.y ?? 0 });

    // Apply saved config parameters so nodes with dynamic sockets
    // (e.g. JSONManipulatorNode) rebuild their sockets correctly.
    for (const param of nodeData.configParameters ?? []) {
      if (param.paramValue !== undefined && freshNode.setConfigParameter) {
        freshNode.setConfigParameter(param.parameterName, param.paramValue);
      }
    }

    return {
      ...freshNode,
      ...nodeData,
      category: nodeData.category ?? freshNode.category,
      sockets: freshNode.sockets, 
    };
  });
}

export function remapConnections(
  workflow: Workflow
): Array<{ fromSocket: number; toSocket: number; label?: string }> {
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

    return { fromSocket: newFrom, toSocket: newTo, label: conn.label };
  });
}