import type { Workflow } from "../Models/Workflow";
import { hydrateWorkflowNodes } from "./utils/runtime";
import { globalBroadcast } from "../Websocket/socket";
import { WebSocket } from "ws";
import type { NodeExecutionContext } from "./types/types";

export const executeFlowRuntime = async (
  workflow: Workflow,
  ws: WebSocket,
  context?: string,
  triggerData?: unknown
) => {
  try {
    const nodes = hydrateWorkflowNodes(workflow);
    const connections = workflow.connections;
    const savedSocketToNode: Record<number, number> = {};
    for (const nodeData of workflow.nodes) {
      for (const s of nodeData.sockets) {
        savedSocketToNode[s.id] = nodeData.id;
      }
    }
    type EdgeInfo = {
      fromNodeId: number;
      toNodeId: number;
      fromSocketTitle: string;
      toSocketTitle: string;   
    };
    const edges: EdgeInfo[] = [];

    for (const conn of connections) {
      const fromNodeId = savedSocketToNode[conn.fromSocket];
      const toNodeId   = savedSocketToNode[conn.toSocket];
      if (fromNodeId === undefined || toNodeId === undefined) continue;

      const fromNodeData = workflow.nodes.find(n => n.id === fromNodeId);
      const toNodeData   = workflow.nodes.find(n => n.id === toNodeId);
      const fromSocket   = fromNodeData?.sockets.find(s => s.id === conn.fromSocket);
      const toSocket     = toNodeData?.sockets.find(s => s.id === conn.toSocket);

      edges.push({
        fromNodeId,
        toNodeId,
        fromSocketTitle: fromSocket?.title ?? "",
        toSocketTitle:   toSocket?.title  ?? "",
      });
    }
    const upstreamEdges: Record<number, EdgeInfo[]> = {};
    for (const node of nodes) upstreamEdges[node.id] = [];
    for (const edge of edges) {
      upstreamEdges[edge.toNodeId]?.push(edge);
    }
    const adjList2 = new Map<number, Set<number>>();
    const indegree2 = new Map<number, number>();
    for (const node of nodes) {
      adjList2.set(node.id, new Set());
      indegree2.set(node.id, 0);
    }
    for (const edge of edges) {
      if (!adjList2.get(edge.fromNodeId)?.has(edge.toNodeId)) {
        adjList2.get(edge.fromNodeId)!.add(edge.toNodeId);
        indegree2.set(edge.toNodeId, (indegree2.get(edge.toNodeId) ?? 0) + 1);
      }
    }
    const executionLayers: number[][] = [];
    let currentLayer2 = [...indegree2.entries()]
      .filter(([, deg]) => deg === 0)
      .map(([id]) => id);
    while (currentLayer2.length > 0) {
      executionLayers.push(currentLayer2);
      const nextLayer2: number[] = [];
      for (const nid of currentLayer2) {
        for (const neighbor of adjList2.get(nid) ?? []) {
          const newDeg = (indegree2.get(neighbor) ?? 0) - 1;
          indegree2.set(neighbor, newDeg);
          if (newDeg === 0) nextLayer2.push(neighbor);
        }
      }
      currentLayer2 = nextLayer2;
    }

    if (executionLayers.flat().length !== nodes.length) {
      throw new Error("Cycle detected in graph - topological sort incomplete");
    }

    const results = new Map<number, unknown>();
    const skippedNodes = new Set<number>();
    for (const layer of executionLayers) {
      for (const nodeId of layer) {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        const inputs: Record<number, unknown> = {};

        if (node.nodeType === "WorkflowInput") {
          inputs[0] = context;
        }

        const myUpstream = upstreamEdges[nodeId] ?? [];

        for (const edge of myUpstream) {
          const sourceResult = results.get(edge.fromNodeId);
          let value: unknown;

          if (
            sourceResult !== null &&
            sourceResult !== undefined &&
            typeof sourceResult === "object" &&
            !Array.isArray(sourceResult)
          ) {
            const obj = sourceResult as Record<string | number, unknown>;
            const titleMatch = Object.entries(obj).find(([k]) => {
              const srcNode = nodes.find(n => n.id === edge.fromNodeId);
              const sock = srcNode?.sockets.find(s => s.title === edge.fromSocketTitle && s.type === "output");
              return sock && (String(k) === String(sock.id));
            });

            if (titleMatch) {
              value = titleMatch[1];
            } else {
              const srcNode = nodes.find(n => n.id === edge.fromNodeId);
              const sock = srcNode?.sockets.find(s => s.title === edge.fromSocketTitle && s.type === "output");
              if (sock && sock.id in obj) {
                value = obj[sock.id];
              } else {
                value = sourceResult;
              }
            }
          } else {

            value = sourceResult;
          }
          const destSock = node.sockets.find(
            s => s.title === edge.toSocketTitle && s.type === "input"
          );
          if (destSock) {
            inputs[destSock.id] = value;
          }
        }
        if (myUpstream.length > 0) {
          const fedBySkipped = myUpstream.every(e => skippedNodes.has(e.fromNodeId));
          const allUndefined = myUpstream.every(e => {
            const srcNode = nodes.find(n => n.id === e.fromNodeId);
            const sock = srcNode?.sockets.find(s => s.title === e.fromSocketTitle && s.type === "output");
            const sourceResult = results.get(e.fromNodeId);
            if (
              sourceResult !== null &&
              sourceResult !== undefined &&
              typeof sourceResult === "object" &&
              !Array.isArray(sourceResult) &&
              sock
            ) {
              const obj = sourceResult as Record<number, unknown>;
              return sock.id in obj ? obj[sock.id] === undefined : false;
            }
            return sourceResult === undefined;
          });

          console.log(`[skip check] node ${nodeId} (${node.title}): fedBySkipped=${fedBySkipped} allUndefined=${allUndefined}`);

          if (fedBySkipped || allUndefined) {
            skippedNodes.add(nodeId);
            console.log(`Node ${nodeId} (${node.title}) skipped — branch not taken.`);
            globalBroadcast?.({
              type: "workflow_output",
              data: {
                id: Date.now().toString(),
                timestamp: Date.now(),
                type: "info",
                message: `Node ${node.title || nodeId} skipped (branch not taken).`,
                details: null,
              },
            });
            continue;
          }
        }
        let output: unknown;
        if (node.process) {
          const execContext: NodeExecutionContext = {
            node,
            inputs,
            ws,
            triggerData,
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
      }
    }
    const lastNodeId = executionLayers[executionLayers.length - 1]?.[0] || 0;
    const finalResult = results.get(lastNodeId);
    // Convert Map to plain object for serialization
    const resultsObject = Object.fromEntries(results.entries());
    return { layers: executionLayers, results: resultsObject, finalResult };
  } catch (error) {
    console.error(error);
    return {
      error: true,
      message: error instanceof Error ? error.message : "Unknown error",
      code: "EXECUTION_ERROR",
    };
  }
};