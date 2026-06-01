import type { Workflow } from "../Models/Workflow";
import { hydrateWorkflowNodes } from "./utils/runtime";
import { globalBroadcast } from "../Websocket/socket";
import { WebSocket } from "ws";
import type { NodeExecutionContext } from "./types/types";

const stopRegistry = new Map<string, boolean>();

export function requestStop(workflowId: string): void {
  stopRegistry.set(workflowId, true);
}

function isStopped(workflowId: string): boolean {
  return stopRegistry.get(workflowId) === true;
}

const CHAT_LOOP_NODE_TYPES = new Set([
  "GeminiChat",
  "ClaudeChat",
  "GroqChat",
  "OpenAIChat",
  "OpenRouterChat",
]);

export const executeFlowRuntime = async (
  workflow: Workflow,
  ws: WebSocket,
  context?: string,
  triggerData?: unknown
) => {
  const workflowId = String(workflow.id ?? "default");
  stopRegistry.set(workflowId, false);

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

    const adjList = new Map<number, Set<number>>();
    const indegree = new Map<number, number>();
    for (const node of nodes) {
      adjList.set(node.id, new Set());
      indegree.set(node.id, 0);
    }
    for (const edge of edges) {
      if (!adjList.get(edge.fromNodeId)?.has(edge.toNodeId)) {
        adjList.get(edge.fromNodeId)!.add(edge.toNodeId);
        indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) ?? 0) + 1);
      }
    }
    const executionLayers: number[][] = [];
    let currentLayer = [...indegree.entries()]
      .filter(([, deg]) => deg === 0)
      .map(([id]) => id);
    while (currentLayer.length > 0) {
      executionLayers.push(currentLayer);
      const nextLayer: number[] = [];
      for (const nid of currentLayer) {
        for (const neighbor of adjList.get(nid) ?? []) {
          const newDeg = (indegree.get(neighbor) ?? 0) - 1;
          indegree.set(neighbor, newDeg);
          if (newDeg === 0) nextLayer.push(neighbor);
        }
      }
      currentLayer = nextLayer;
    }

    const results = new Map<number, unknown>();
    const skippedNodes = new Set<number>();

    const loopNodeIds = new Set(
      nodes
        .filter(n => {
          if (n.nodeType !== "Loop") return false;
          const runMode = String(
            (n as unknown as { getConfigParameter?: (k: string) => { paramValue?: string; defaultValue?: string } })
              .getConfigParameter?.("Run Mode")?.paramValue ??
            (n as unknown as { getConfigParameter?: (k: string) => { paramValue?: string; defaultValue?: string } })
              .getConfigParameter?.("Run Mode")?.defaultValue ??
            "single"
          );
          return runMode === "all";
        })
        .map(n => n.id)
    );

    type ChatLoopPair = { userInputId: number; chatNodeId: number };
    const chatLoopPairs: ChatLoopPair[] = [];

    for (const edge of edges) {
      const fromNode = nodes.find(n => n.id === edge.fromNodeId);
      const toNode   = nodes.find(n => n.id === edge.toNodeId);
      if (
        fromNode?.nodeType === "UserPrompt" &&
        toNode?.nodeType !== undefined &&
        CHAT_LOOP_NODE_TYPES.has(toNode.nodeType) &&
        edge.fromSocketTitle === "User Input" &&
        edge.toSocketTitle   === "Prompt Loop"
      ) {
        chatLoopPairs.push({ userInputId: edge.fromNodeId, chatNodeId: edge.toNodeId });
      }
    }
    const chatLoopNodeIds = new Set<number>();
    for (const pair of chatLoopPairs) {
      chatLoopNodeIds.add(pair.userInputId);
      chatLoopNodeIds.add(pair.chatNodeId);
    }
    function getLoopBodyIds(startId: number): Set<number> {
      const visited = new Set<number>();
      const queue = [startId];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const edge of edges) {
          if (edge.fromNodeId === cur && edge.fromSocketTitle !== "Done" && !visited.has(edge.toNodeId)) {
            queue.push(edge.toNodeId);
          }
        }
      }
      visited.delete(startId);
      return visited;
    }

    function isInsideLoopBody(nodeId: number): boolean {
      for (const loopId of loopNodeIds) {
        if (getLoopBodyIds(loopId).has(nodeId)) return true;
      }
      return false;
    }

    async function executeNode(nodeId: number): Promise<void> {
      if (isStopped(workflowId)) return;

      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      const inputs: Record<number, unknown> = {};

      if (node.nodeType === "WorkflowInput") inputs[0] = context;

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
          const srcNode = nodes.find(n => n.id === edge.fromNodeId);
          const sock = srcNode?.sockets.find(s => s.title === edge.fromSocketTitle && s.type === "output");
          value = sock && sock.id in obj ? obj[sock.id] : sourceResult;
        } else {
          value = sourceResult;
        }

        const destSock = node.sockets.find(s => s.title === edge.toSocketTitle && s.type === "input");
        if (destSock) inputs[destSock.id] = value;
      }

      if (myUpstream.length > 0) {
        const fedBySkipped = myUpstream.some(e => skippedNodes.has(e.fromNodeId));
        const allUndefined = myUpstream.every(e => {
          const srcNode = nodes.find(n => n.id === e.fromNodeId);
          const sock = srcNode?.sockets.find(s => s.title === e.fromSocketTitle && s.type === "output");
          const sourceResult = results.get(e.fromNodeId);
          if (sourceResult !== null && sourceResult !== undefined && typeof sourceResult === "object" && !Array.isArray(sourceResult) && sock) {
            const obj = sourceResult as Record<number, unknown>;
            return sock.id in obj ? obj[sock.id] === undefined : false;
          }
          return sourceResult === undefined;
        });

        console.log(`[skip check] node ${nodeId} (${node.title}): fedBySkipped=${fedBySkipped} allUndefined=${allUndefined}`);

        if (fedBySkipped || allUndefined) {
          skippedNodes.add(nodeId);
          console.log(`Node ${nodeId} (${node.title}) skipped — branch not taken.`);
          globalBroadcast?.({ type: "workflow_output", data: { id: Date.now().toString(), timestamp: Date.now(), type: "info", message: `Node ${node.title || nodeId} skipped (branch not taken).`, details: null } });
          return;
        }
      }

      let output: unknown;
      if (node.process) {
        const execContext: NodeExecutionContext = {
          node, inputs, ws, triggerData,
          ...(node.nodeType === "Loop" ? { workflow, allNodes: nodes } : {}),
        } as NodeExecutionContext;
        output = await node.process(execContext);
      } else {
        output = node.nodeValue ?? null;
      }

      results.set(nodeId, output);
      console.log(`Node ${nodeId} executed. Output:`, String(output).substring(0, 60));
      globalBroadcast?.({ type: "workflow_output", data: { id: Date.now().toString(), timestamp: Date.now(), type: "info", message: `Node ${node.title || nodeId} executed.`, details: JSON.stringify(output, null, 2) } });
    }
    async function executeNodeWithInputs(nodeId: number, extraInputs: Record<number, unknown>): Promise<void> {
      if (isStopped(workflowId)) return;

      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      const inputs: Record<number, unknown> = { ...extraInputs };
      const myUpstream = upstreamEdges[nodeId] ?? [];
      for (const edge of myUpstream) {
        if (edge.fromSocketTitle === "User Input" && edge.toSocketTitle === "Prompt Loop") continue;

        const sourceResult = results.get(edge.fromNodeId);
        let value: unknown;

        if (sourceResult !== null && sourceResult !== undefined && typeof sourceResult === "object" && !Array.isArray(sourceResult)) {
          const obj = sourceResult as Record<string | number, unknown>;
          const srcNode = nodes.find(n => n.id === edge.fromNodeId);
          const sock = srcNode?.sockets.find(s => s.title === edge.fromSocketTitle && s.type === "output");
          value = sock && sock.id in obj ? obj[sock.id] : sourceResult;
        } else {
          value = sourceResult;
        }

        const destSock = node.sockets.find(s => s.title === edge.toSocketTitle && s.type === "input");
        if (destSock && !(destSock.id in inputs)) inputs[destSock.id] = value;
      }

      let output: unknown;
      if (node.process) {
        const execContext: NodeExecutionContext = { node, inputs, ws, triggerData } as NodeExecutionContext;
        output = await node.process(execContext);
      } else {
        output = node.nodeValue ?? null;
      }

      results.set(nodeId, output);
      console.log(`Node ${nodeId} (chat) executed. Output:`, String(output).substring(0, 60));
      globalBroadcast?.({ type: "workflow_output", data: { id: Date.now().toString(), timestamp: Date.now(), type: "info", message: `Node ${node.title || nodeId} executed.`, details: JSON.stringify(output, null, 2) } });
    }

    function broadcastIterationResults(iterationIndex: number): void {
      const iterResults: Record<string, unknown> = {};
      for (const [nodeId, result] of results.entries()) iterResults[String(nodeId)] = result;
      globalBroadcast?.({ type: "workflow_iteration", data: { workflowId, iterationIndex, results: iterResults } });
    }

    async function runChatLoop(pair: ChatLoopPair): Promise<void> {
      const { userInputId, chatNodeId } = pair;

      const userInputNode = nodes.find(n => n.id === userInputId)!;
      const chatNode      = nodes.find(n => n.id === chatNodeId)!;

      const uiUserInputSocketId  = userInputNode.sockets.find(s => s.title === "User Input"  && s.type === "output")?.id;
      const uiMessageSocketId    = userInputNode.sockets.find(s => s.title === "Message"     && s.type === "input")?.id;
      const gcPromptLoopSocketId = chatNode.sockets.find(s => s.title === "Prompt Loop"      && s.type === "input")?.id;
      const gcResponseSocketId   = chatNode.sockets.find(s => s.title === "Response"         && s.type === "output")?.id;

      const MAX_TURNS = 10000;
      let turn = 0;
      let chatResponse = ""; 

      ws.send(JSON.stringify({
        type: "message",
        data: { id: crypto.randomUUID(), timestamp: Date.now(), type: "info", message: `💬 Chat loop started (${chatNode.title})` },
      }));

      while (turn < MAX_TURNS) {
        if (isStopped(workflowId)) {
          console.log(`[Chat] Stopped at turn ${turn}.`);
          break;
        }

        const uiExtra: Record<number, unknown> = {};
        if (uiMessageSocketId !== undefined && chatResponse) {
          uiExtra[uiMessageSocketId] = chatResponse;
        }
        await executeNodeWithInputs(userInputId, uiExtra);

        const uiResult = results.get(userInputId) as Record<number, unknown> | undefined;

        const userInputValue =
          uiResult && uiUserInputSocketId !== undefined
            ? uiResult[uiUserInputSocketId]
            : undefined;

        if (userInputValue === undefined || userInputValue === null || userInputValue === "") {
          console.log(`[Chat] Exit detected. Ending after ${turn} turn(s).`);
          ws.send(JSON.stringify({
            type: "message",
            data: { id: crypto.randomUUID(), timestamp: Date.now(), type: "success", message: `💬 Chat ended after ${turn} turn(s)` },
          }));
          break;
        }

        const userText = String(userInputValue);
        if (isStopped(workflowId)) break;
        const gcExtra: Record<number, unknown> = {};
        if (gcPromptLoopSocketId !== undefined) gcExtra[gcPromptLoopSocketId] = userText;
        await executeNodeWithInputs(chatNodeId, gcExtra);

        const gcResult = results.get(chatNodeId) as Record<number, unknown> | undefined;
        chatResponse =
          gcResult && gcResponseSocketId !== undefined
            ? String(gcResult[gcResponseSocketId] ?? "")
            : "";

        ws.send(JSON.stringify({
          type: "message",
          data: { id: crypto.randomUUID(), timestamp: Date.now(), type: "info", message: `💬 Turn ${turn + 1} completed` },
        }));

        broadcastIterationResults(turn);
        turn++;
      }

      if (turn >= MAX_TURNS) console.warn(`[Chat] Hit MAX_TURNS safety cap.`);
    }

    for (const layer of executionLayers) {
      if (isStopped(workflowId)) { console.log(`[Stop] Workflow ${workflowId} stopped before layer.`); break; }

      for (const nodeId of layer) {
        if (isStopped(workflowId)) { console.log(`[Stop] Workflow ${workflowId} stopped at node ${nodeId}.`); break; }

        const node = nodes.find(n => n.id === nodeId);

        if (loopNodeIds.has(nodeId)) {
          const loopBodyIds     = getLoopBodyIds(nodeId);
          const orderedLoopBody = executionLayers.flat().filter(id => loopBodyIds.has(id));
          const MAX_ITERATIONS  = 10000;
          let iterations        = 0;

          while (iterations < MAX_ITERATIONS) {
            if (isStopped(workflowId)) { console.log(`[Stop] Loop ${nodeId} stopped at iteration ${iterations}.`); break; }

            await executeNode(nodeId);

            const loopResult         = results.get(nodeId) as Record<number, unknown> | undefined;
            const loopNode           = nodes.find(n => n.id === nodeId)!;
            const loopOutputSocketId = loopNode.sockets.find(s => s.title === "Loop" && s.type === "output")?.id;
            const doneOutputSocketId = loopNode.sockets.find(s => s.title === "Done" && s.type === "output")?.id;
            const loopValue = loopResult && loopOutputSocketId !== undefined ? loopResult[loopOutputSocketId] : undefined;
            const doneValue = loopResult && doneOutputSocketId !== undefined ? loopResult[doneOutputSocketId] : undefined;

            if (doneValue !== undefined && loopValue === undefined) {
              console.log(`[Loop] Node ${nodeId} done after ${iterations} iteration(s).`);
              break;
            }

            for (const downId of orderedLoopBody) {
              if (isStopped(workflowId)) break;
              skippedNodes.delete(downId);
              results.delete(downId);
              await executeNode(downId);
            }

            broadcastIterationResults(iterations);
            iterations++;
          }

          if (iterations >= MAX_ITERATIONS) console.warn(`[Loop] Node ${nodeId} hit MAX_ITERATIONS safety cap.`);

        // UserPrompt that starts a chat loop
        } else if (
          chatLoopNodeIds.has(nodeId) &&
          node?.nodeType === "UserPrompt"
        ) {
          const pair = chatLoopPairs.find(p => p.userInputId === nodeId);
          if (pair) await runChatLoop(pair);

        } else if (
          chatLoopNodeIds.has(nodeId) &&
          node?.nodeType !== undefined &&
          CHAT_LOOP_NODE_TYPES.has(node.nodeType)
        ) {
          console.log(`[Chat] Skipping ${node.nodeType} node ${nodeId} — handled by chat loop.`);

        } else if (!isInsideLoopBody(nodeId)) {
          await executeNode(nodeId);
        }
      }
    }

    stopRegistry.delete(workflowId);

    const lastNodeId = executionLayers[executionLayers.length - 1]?.[0] || 0;
    const finalResult = results.get(lastNodeId);
    const resultsObject = Object.fromEntries(results.entries());
    return { layers: executionLayers, results: resultsObject, finalResult };
  } catch (error) {
    stopRegistry.delete(workflowId);
    console.log(error);
    return error;
  }
};