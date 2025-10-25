import type { Workflow } from "../Models/Workflow";
import { buildExecutionLayers, hydrateWorkflowNodes } from "./utils/runtime";
import { globalBroadcast } from "../Websocket/socket";
import { WebSocket } from "ws";
import type { NodeExecutionContext } from "./types/types";

export const executeFlowRuntime = async (
  workflow: Workflow,
  ws: WebSocket,
  context?: string
) => {
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

          // Add context to WorkflowInput Node
          if (node.nodeType == "WorkflowInput") {
            inputs[0] = context;
          }

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
            const execContext: NodeExecutionContext = {
              node: node,
              inputs: inputs,
              ws,
            };
            output = await node.process(execContext);
          } else {
            // fallback: just echo nodeValue
            output = node.nodeValue ?? null;
          }

          results.set(nodeId, output);
          console.log(
            `Node ${nodeId} executed. Output:`,
            String(output).substring(0, 30)
          );
          globalBroadcast?.({
            type: "workflow_output",
            data: {
              id: Date.now().toString(),
              timestamp: Date.now(),
              type: "info",
              message: `Node ${node.title || nodeId} executed.`,
              details: JSON.stringify(output, null, 2),
            },
          });
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
