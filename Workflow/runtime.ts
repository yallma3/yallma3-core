import type { Workflow } from "../Models/Workflow";
import type { BaseNode, NodeValue } from "./types/types";
import { buildExecutionLayers, hydrateWorkflowNodes } from "./utils/runtime";

export const executeFlowRuntime = async (workflow: Workflow) => {
  try {
    const connections = workflow.connections;
    const nodes = hydrateWorkflowNodes(workflow);

    const executionLayers = buildExecutionLayers(workflow);

    const results = new Map<number, any>();

    // build quick lookup maps
    const socketToNode: Record<number, number> = {};
    const inputSockets: Record<number, number[]> = {}; // nodeId -> input socketIds
    for (const node of nodes) {
      inputSockets[node.id] = node.sockets
        .filter((s) => s.type === "input")
        .map((s) => s.id);
      for (const s of node.sockets) socketToNode[s.id] = node.id;
    }

    // map input sockets -> source socket
    const inputConnections: Record<number, number> = {}; // toSocket -> fromSocket
    for (const c of connections) {
      inputConnections[c.toSocket] = c.fromSocket;
    }

    // run layer by layer
    for (const layer of executionLayers) {
      await Promise.all(
        layer.map(async (nodeId) => {
          const node = nodes.find((n) => n.id === nodeId);
          if (!node) return;

          // gather inputs for this node
          const inputs: Record<string, any> = {};
          for (const socketId of inputSockets[nodeId] ?? []) {
            const fromSocket = inputConnections[socketId];
            if (fromSocket !== undefined) {
              const fromNodeId = socketToNode[fromSocket];
              if (fromNodeId !== undefined) {
                const sourceResult = results.get(fromNodeId);

                if (
                  sourceResult &&
                  typeof sourceResult === "object" &&
                  fromSocket in sourceResult
                ) {
                  // Case: multiple outputs (object keyed by socketId)
                  inputs[socketId] = sourceResult[fromSocket];
                } else {
                  // Case: single output (direct value)
                  inputs[socketId] = sourceResult;
                }
              }
            }
          }

          // run the node
          let output: any;
          if (node.process) {
            output = await node.process({ inputs, node });
          } else {
            // fallback: just echo nodeValue
            output = node.nodeValue ?? null;
          }

          results.set(nodeId, output);
        })
      );
    }
    const lastNodeId = executionLayers[executionLayers.length - 1]?.[0] || 0;
    const finalResult = results.get(lastNodeId);
    // Convert Map to plain object for serialization
    const resultsObject = Object.fromEntries(results.entries());
    return { layers: executionLayers, results: resultsObject, finalResult };
  } catch (error) {
    console.log(error);
    return error;
  }
};
