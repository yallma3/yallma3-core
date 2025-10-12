import type { Agent } from "../../Models/Agent";
import type { Task } from "../../Models/Task";
import type { Workflow } from "../../Models/Workflow";
import type { LLMProvider } from "../../Models/LLM";

export async function assignBestFit(
  llm: LLMProvider,
  task: Task,
  workflows: Workflow[],
  agents: Agent[],
  mcps: string[] = []
): Promise<{
  type: "workflow" | "agent" | "mcp";
  id: string;
  confidence: number;
  reasoning: string;
}> {
  const prompt = `You are an intelligent task assignment system. Your job is to analyze a given task and determine the best executor (workflow, agent, or MCP tool) to accomplish it.

TASK TO ANALYZE:
Title: ${task.title}
Description: ${task.description}
Expected Output: ${task.expectedOutput}

AVAILABLE EXECUTORS:

WORKFLOWS (${workflows.length} available):
${workflows
  .map(
    (w) => `
- ID: ${w.id}
- Name: ${w.name}
- Description: ${w.description}
`
  )
  .join("\n")}

AGENTS (${agents.length} available):
${agents
  .map(
    (a) => `
- ID: ${a.id}
- Name: ${a.name}
- Role: ${a.role}
- Objective: ${a.objective}
- Background: ${a.background}
- Capabilities: ${a.capabilities}
- Tools: ${a.tools.map((t) => t.name).join(", ")}
- LLM: ${a.llm}
`
  )
  .join("\n")}

MCP TOOLS (${mcps.length} available):
${mcps.map((mcp) => `- ${mcp}`).join("\n")}

DECISION CRITERIA:
1. Task Complexity: Simple tasks → MCP tools, Medium → Workflows, Complex → Agents
2. Domain Match: Choose executor whose capabilities best match the task domain
3. Output Requirements: Ensure executor can produce the expected output format
4. Tool Availability: Consider what tools/nodes are available in each executor
5. Efficiency: Prefer simpler solutions when they can accomplish the task

RESPONSE FORMAT:
You must respond with a valid JSON object containing:
{
  "type": "workflow" | "agent" | "mcp",
  "id": "exact_id_from_available_options",
  "confidence": number_between_0_and_1,
  "reasoning": "detailed_explanation_of_why_this_choice_is_best"
}

IMPORTANT:
- The "id" must exactly match one of the IDs provided above
- Confidence should reflect how certain you are this is the best choice
- Reasoning should explain why this executor is better than alternatives
- Consider the task's complexity, required capabilities, and expected output
- If no executor seems suitable, choose the closest match and explain limitations

Analyze the task and provide your decision:`;

  try {
    const response = await llm.generateText(prompt);

    // Parse the JSON response
    const cleanResponse = response.trim();
    let jsonStart = cleanResponse.indexOf("{");
    let jsonEnd = cleanResponse.lastIndexOf("}") + 1;

    if (jsonStart === -1 || jsonEnd === 0) {
      throw new Error("No valid JSON found in response");
    }

    const jsonStr = cleanResponse.substring(jsonStart, jsonEnd);
    const result = JSON.parse(jsonStr);

    // Validate the response structure
    if (
      !result.type ||
      !result.id ||
      typeof result.confidence !== "number" ||
      !result.reasoning
    ) {
      throw new Error("Invalid response structure from LLM");
    }

    // Validate that the ID exists in the available options
    const validId = validateExecutorId(
      result.type,
      result.id,
      workflows,
      agents,
      mcps
    );
    if (!validId) {
      throw new Error(
        `Invalid executor ID: ${result.id} for type: ${result.type}`
      );
    }

    // Ensure confidence is between 0 and 1
    result.confidence = Math.max(0, Math.min(1, result.confidence));

    return result;
  } catch (error) {
    console.error("Error in assignBestFit:", error);

    throw new Error("No executors available and LLM parsing failed");
  }
}

function validateExecutorId(
  type: string,
  id: string,
  workflows: Workflow[],
  agents: Agent[],
  mcps: string[]
): boolean {
  switch (type) {
    case "workflow":
      return workflows.some((w) => w.id === id);
    case "agent":
      return agents.some((a) => a.id === id);
    case "mcp":
      return mcps.includes(id);
    default:
      return false;
  }
}
