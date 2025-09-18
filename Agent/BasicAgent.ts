import { json } from "express";
import { getLLMProvider, runLLM } from "../LLM/LLMRunner";
import type { WorkspaceData } from "../Models/Workspace";
import { WebSocket } from "ws";

function generateWorkspacePrompt(workspaceData: WorkspaceData): string {
  const prompt = `
  You are an expert AI project planner. Given the following project metadata, return a structured execution plan in **valid JSON**.
  
  ---
  
  Project Info:
  {
    "name": "${workspaceData.name}",
    "description": "${workspaceData.description}"
  }
  
  Agents:
  ${JSON.stringify(
    workspaceData.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      objective: agent.objective,
      background: agent.background,
      capabilities: agent.capabilities,
      tools: agent.tools?.map((t) => t.name) || [],
      llmId: agent.llmId,
    })),
    null,
    2
  )}
  
  Tasks:
  ${JSON.stringify(
    workspaceData.tasks.map((task) => ({
      id: task.id,
      name: task.name,
      description: task.description,
      expectedOutput: task.expectedOutput,
      type: task.executeWorkflow ? "workflow" : "agentic",
      workflow:
        task.executeWorkflow && task.workflowId
          ? {
              id: task.workflowId,
              name: task.workflowName || "Unnamed Workflow",
            }
          : null,
      assignedAgent: task.executeWorkflow
        ? null
        : task.assignedAgent
        ? {
            name:
              workspaceData.agents.find((a) => a.id === task.assignedAgent)
                ?.name || "Unknown",
            fixed: true,
          }
        : {
            name: null,
            fixed: false,
          },
    })),
    null,
    2
  )}
  
  Workflows:
  ${JSON.stringify(
    workspaceData.workflows.map((wf) => ({
      id: wf.id,
      name: wf.name,
      description: wf.description,
    })),
    null,
    2
  )}
  
  ---
  
  Instructions:
  Based on the above context, return a project execution plan as valid JSON only.
  
  ### JSON Format to Return:
  
  {
    "project": {
      "name": "string",
      "objective": "string"
    },
    "steps": [
      {
        "step": 1,
        "task": "string = task id",
        "type": "agentic" | "workflow",
        "agent": "string (if type is agentic and assignedAgent.fixed is true, use it; if fixed is false, choose the most suitable agent based on the agent's background, role, capabilities, and tools) = agent id,",
        "workflow": "string (if type is workflow) = workflow id",
        "description": "string",
        "inputs": ["string"],
        "outputs": ["string"],
        "toolsUsed": ["string"],
        "dependsOn": [stepNumber]
      }
    ],
    "collaboration": {
      "notes": "string",
      "pairings": [
        {
          "agents": ["string", "string"],
          "purpose": "string"
        }
      ]
    },
    "workflowRecommendations": [
      {
        "name": "string",
        "action": "use" | "ignore" | "move_to_separate_project",
        "notes": "string"
      }
    ]
  }
  
  Notes:
  - Each step must have either an "agent" (for agentic tasks) or a "workflow" (for automated tasks), never both.
  - For steps where "type" is "agentic":
    - If the task includes a pre-assigned agent, use their name in the "agent" field.
    - If the agent is not pre-assigned, choose the most suitable agent based on role, tools, and capabilities.
  - For steps where "type" is "workflow", provide the "workflow" field with the workflow name and omit the "agent".
  - Fill in "toolsUsed" only if relevant tools are needed from the agent’s toolset.
  - Use "dependsOn" to specify step order or prerequisites if necessary.
  - Output a clean and valid JSON object only — no markdown or extra explanation.
  
  Only return the JSON object — no additional text, markdown, or explanation.
  No Notes at the end.
  No Text Before the json.
  No \`\`\`json before or \`\`\` after.
  `;
  return prompt;
}
// Handle running workspace (placeholder for future implementation)
export const BasicAgentRuntime = async (
  workspaceData: WorkspaceData,
  ws: WebSocket
) => {
  if (!workspaceData) return;

  // prepare prompt
  const propmt = generateWorkspacePrompt(workspaceData);
  // Main workspace LLM
  const MainLLM = getLLMProvider(workspaceData.mainLLM, workspaceData.apiKey);

  // event for creating plan
  ws.send(
    JSON.stringify({
      type: "message",
      data: "Creating Plan... ",
      timestamp: new Date().toISOString(),
    })
  );

  const plan = await runLLM(MainLLM, propmt);

  // Remove markdown code block formatting if present
  const cleanedPlan = plan.replace(/^```json\s*/, "").replace(/\s*```$/, "");

  const parsedPlan = JSON.parse(cleanedPlan);

  if (parsedPlan) {
    ws.send(
      JSON.stringify({
        type: "message",
        data: "Plan Created Successfully",
        timestamp: new Date().toISOString(),
      })
    );
  } else {
    ws.send(
      JSON.stringify({
        type: "message",
        data: "Plan Creation Failed",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  ws.send(
    JSON.stringify({
      type: "message",
      data: "Executing Plan",
      timestamp: new Date().toISOString(),
    })
  );

  // run the prompt throught the main LLM to get back the plan
  // parse plan
  // send event for plan created
  // run plan steps sequentially (Task graph of tasks that are executed in parallel or sequentially will be implemented in the future)
  // each step is exectuted through agent or workflow then result is returned
  // keep track of the results from each step to give to the next step as input
  // send final result and finished workspace execution event
  return plan;
};
