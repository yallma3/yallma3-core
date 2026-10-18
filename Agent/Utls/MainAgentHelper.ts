import type { Agent } from "../../Models/Agent";
import type { Task } from "../../Models/Task";
import type { Workflow } from "../../Models/Workflow";
import type { LLMProvider } from "../../Models/LLM";
import { Helper } from "../../Utils/Helper";
export type BestFitAssignment = {
  type: "workflow" | "agent";
  id: string;
  name: string;
  confidence: number;
  reasoning: string;
};

export async function assignBestFit(
  llm: LLMProvider,
  task: Task,
  workflows: Workflow[],
  agents: Agent[]
): Promise<BestFitAssignment> {
  const workflowYamls = workflows.map((w) => generateWorkflowYaml(w));

  const agentYamls = await Promise.all(
    agents.map((a) => generateAgentYaml(llm, a))
  );

  const executorsSection = [
    ...(workflowYamls.length
      ? [`WORKFLOWS (${workflowYamls.length} available):`, ...workflowYamls]
      : []),
    "",
    ...(agentYamls.length
      ? [`AGENTS (${agentYamls.length} available):`, ...agentYamls]
      : []),
  ].join("\n");

  const prompt = `You are an intelligent task assignment system. Your job is to analyze a given task and determine the best executor (workflow or agent) to accomplish it.

TASK TO ANALYZE:
Title: ${task.title}
Description: ${task.description}
Expected Output: ${task.expectedOutput}

AVAILABLE EXECUTORS:

${executorsSection}

DECISION CRITERIA:
1. Domain Match: Choose executor whose input/output/capabilities best match the task requirements
2. Output Requirements: Ensure executor can produce the expected output format
3. Tool Availability: Consider what tools or nodes are available in each executor
4. Efficiency: Prefer simpler solutions when they can accomplish the task

RESPONSE FORMAT:
You must respond with a valid JSON object containing:
{
  "type": "workflow" | "agent",
  "id": "exact_id_from_available_options",
  "name": "human_readable_name_of_the_selected_executor",
  "confidence": absolute_confidence_score_0_to_100,
  "reasoning": "detailed_explanation_of_why_this_choice_is_best"
}

IMPORTANT:
- The "id" must exactly match one of the IDs provided above
- Confidence is an ABSOLUTE score from 0 to 100, NOT a probability distribution between candidates. A score of 100 means this executor is perfectly suited; 0 means completely unsuited.
- Reasoning should explain why this executor is better than alternatives
- Consider the task's complexity, required capabilities, and expected output
- If no executor seems suitable, choose the closest match and explain limitations

Analyze the task and provide your decision:`;

  try {
    const response = await llm.generateText(prompt);
    console.log(response);

    const parsed = Helper.JsonParser.safeParse(response);
    if (!parsed.success) {
      throw new Error("No valid JSON found in response");
    }
    const result = parsed.data as Record<string, unknown>;

    // Validate the response structure
    if (
      !result.type ||
      !result.id ||
      typeof result.confidence !== "number" ||
      !result.reasoning
    ) {
      throw new Error("Invalid response structure from LLM");
    }

    const type = String(result.type) as "workflow" | "agent";
    const id = String(result.id);
    const confidence = Math.max(0, Math.min(100, result.confidence as number));
    const reasoning = String(result.reasoning);

    // Validate that the ID exists in the available options
    const validId = validateExecutorId(type, id, workflows, agents);
    if (!validId) {
      throw new Error(`Invalid executor ID: ${id} for type: ${type}`);
    }

    // Look up the human-readable name from the available executors
    let name = typeof result.name === "string" ? result.name : "";
    if (!name) {
      switch (type) {
        case "workflow":
          name = workflows.find((w) => w.id === id)?.name ?? id;
          break;
        case "agent":
          name = agents.find((a) => a.id === id)?.name ?? id;
          break;
      }
    }

    return { type, id, name, confidence, reasoning };
  } catch (error) {
    console.error("Error in assignBestFit:", error);

    throw new Error("No executors available and LLM parsing failed");
  }
}

export function generateWorkflowYaml(workflow: Workflow): string {
  const { nodes, connections } = workflow;

  const workflowInputNode = nodes.find((n) => n.nodeType === "WorkflowInput");
  const workflowOutputNode = nodes.find((n) => n.nodeType === "WorkflowOutput");

  const socketToNode = new Map<number, number>();
  for (const node of nodes) {
    for (const socket of node.sockets) {
      socketToNode.set(socket.id, node.id);
    }
  }

  const nodesConnectedToInput = new Set<number>();
  if (workflowInputNode) {
    const inputOutputSocketIds = new Set(
      workflowInputNode.sockets
        .filter((s) => s.type === "output")
        .map((s) => s.id)
    );
    for (const conn of connections) {
      if (inputOutputSocketIds.has(conn.fromSocket)) {
        const targetNodeId = socketToNode.get(conn.toSocket);
        if (targetNodeId !== undefined) {
          nodesConnectedToInput.add(targetNodeId);
        }
      }
    }
  }

  const nodesFeedingToOutput = new Set<number>();
  if (workflowOutputNode) {
    const outputInputSocketIds = new Set(
      workflowOutputNode.sockets
        .filter((s) => s.type === "input")
        .map((s) => s.id)
    );
    for (const conn of connections) {
      if (outputInputSocketIds.has(conn.toSocket)) {
        const sourceNodeId = socketToNode.get(conn.fromSocket);
        if (sourceNodeId !== undefined) {
          nodesFeedingToOutput.add(sourceNodeId);
        }
      }
    }
  }

  const inputTitles: string[] = [];
  const capabilityTitles: string[] = [];
  const outputTitles: string[] = [];

  for (const node of nodes) {
    if (
      node.nodeType === "WorkflowInput" ||
      node.nodeType === "WorkflowOutput"
    )
      continue;

    const hasInput = node.sockets.some((s) => s.type === "input");
    const hasOutput = node.sockets.some((s) => s.type === "output");

    if ((!hasInput && hasOutput) || nodesConnectedToInput.has(node.id)) {
      inputTitles.push(node.title);
    }

    if (hasInput && hasOutput) {
      capabilityTitles.push(node.title);
    }

    if ((hasInput && !hasOutput) || nodesFeedingToOutput.has(node.id)) {
      outputTitles.push(node.title);
    }
  }

  const join = (titles: string[]) => [...new Set(titles)].sort().join(", ");

  return [
    `ID: ${workflow.id}`,
    `Type: workflow`,
    `Name: ${workflow.name}`,
    `Objective: ${workflow.description || ""}`,
    `Input: ${join(inputTitles)}`,
    `Capabilities: ${join(capabilityTitles)}`,
    `Output: ${join(outputTitles)}`,
  ].join("\n");
}

export async function generateAgentYaml(
  llm: LLMProvider,
  agent: Agent
): Promise<string> {
  const prompt = `Analyze the following AI agent and determine what kind of input it typically handles, what capabilities it has, and what kind of output it produces.

AGENT DETAILS:
- Name: ${agent.name}
- Role: ${agent.role}
- Background: ${agent.background}
- Objective: ${agent.objective}
- Capabilities: ${agent.capabilities}
- Tools: ${agent.tools.map((t) => `${t.name}: ${t.description}`).join("\n  ")}

RESPONSE FORMAT:
You must respond with a valid JSON object containing:
{
  "typicalInput": "description of what input this agent typically expects",
  "assumedCapabilities": "description of what this agent can do",
  "typicalOutput": "description of what output this agent typically produces"
}

IMPORTANT:
- typicalInput should describe the kind of data, task, or context this agent expects as input
- assumedCapabilities should summarize what this agent can accomplish (its skills and functions)
- typicalOutput should describe the kind of result this agent produces
- Keep descriptions concise and specific to this agent's purpose

Analyze the agent and provide your response:`;

  try {
    const response = await llm.generateText(prompt);

    const parsed = Helper.JsonParser.safeParse(response);
    if (!parsed.success) {
      throw new Error("No valid JSON found in response");
    }
    const result = parsed.data as Record<string, unknown>;

    const typicalInput = String(result.typicalInput ?? "");
    const assumedCapabilities = String(result.assumedCapabilities ?? "");
    const typicalOutput = String(result.typicalOutput ?? "");

    const toolNames = agent.tools.map((t) => t.name).join(", ");
    const capabilities = toolNames
      ? `${assumedCapabilities}, ${toolNames}`
      : assumedCapabilities;

    return [
      `ID: ${agent.id}`,
      `Type: agent`,
      `Name: ${agent.name}`,
      `Objective: ${agent.role || ""}`,
      `Input: ${typicalInput}`,
      `Capabilities: ${capabilities}`,
      `Output: ${typicalOutput}`,
    ].join("\n");
  } catch (error) {
    console.error("Error in generateAgentYaml:", error);
    throw new Error("Failed to generate agent YAML");
  }
}

function validateExecutorId(
  type: string,
  id: string,
  workflows: Workflow[],
  agents: Agent[]
): boolean {
  switch (type) {
    case "workflow":
      return workflows.some((w) => w.id === id);
    case "agent":
      return agents.some((a) => a.id === id);
    default:
      return false;
  }
}
