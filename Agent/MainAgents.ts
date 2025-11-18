import { getLLMProvider, runLLM } from "../LLM/LLMRunner";
import type { ConsoleEvent, WorkspaceData } from "../Models/Workspace";
import { WebSocket } from "ws";
import { AgentRuntime, Yallma3GenOneAgentRuntime } from "./Agent";
import { executeFlowRuntime } from "../Workflow/runtime";
import type { Workflow } from "../Models/Workflow";
import { getTaskExecutionOrderWithContext } from "../Task/TaskGraph";
import type { AgentStep, TaskGraph } from "../Models/Task";
import {
  analyzeTaskCore,
  planAgenticTask,
} from "../Task/TaskIntrepreter";
import { assignBestFit } from "./Utls/MainAgentHelper";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { workflowExecutor } from "./Utls/ToolCallingHelper";

interface FlowResult {
  layers: unknown;
  results: Record<number, unknown>;
  finalResult: unknown;
}

export function sendWorkflow(ws: WebSocket, workflow: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();

    const listener = (message: WebSocket.RawData) => {
      try {
        const data = JSON.parse(message.toString());
        const workflowJson = JSON.stringify(data.data);
        if (data.type === "workflow_json" && data.id === requestId) {
          ws.off("message", listener); // cleanup
          resolve(workflowJson); // return result to caller
        }
      } catch (err) {
        reject(err);
      }
    };
    console.log("Executing Workflow:", workflow);

    ws.on("message", listener);

    // send request
    ws.send(
      JSON.stringify({
        id: requestId,
        type: "run_workflow",
        requestId,
        data: workflow,
        timestamp: new Date().toISOString(),
      })
    );
  });
}

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
      llm: agent.llm,
    })),
    null,
    2
  )}
  
  Tasks:
  ${JSON.stringify(
    workspaceData.tasks.map((task) => ({
      id: task.id,
      name: task.title,
      description: task.description,
      expectedOutput: task.expectedOutput,
      type: task.type,
      executor: task.executorId,
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

  console.log("STEPS:", parsedPlan.steps);
  let prevResults: string[] = [];

  for (const step of parsedPlan.steps) {
    const task = workspaceData.tasks.find(
      (t) => t.id === step.task || t.title === step.task
    );
    const agent = workspaceData.agents.find(
      (a) => a.id === step.agent || a.name === step.agent
    );

    const type = step.type;
    if (type == "workflow") {
      const workflow = await sendWorkflow(ws, step.workflow);
      const wrapper = JSON.parse(workflow);

      // If workflow is already an object (not string), guard against double-parse
      const json: Workflow =
        typeof wrapper.data === "string"
          ? JSON.parse(wrapper.data)
          : wrapper.data;

       console.log("Parsed workflow:", json);
       const result = await executeFlowRuntime(json, ws);
       if (result && (result as FlowResult).finalResult) {
         prevResults.push((result as FlowResult).finalResult as string);
       }
      ws.send(
        JSON.stringify({
          type: "message",
          data: `Step ${prevResults.length} completed`,
          timestamp: new Date().toISOString(),
        })
      );
      continue;
    }

    if (agent && task) {
      const agentRuntime = new AgentRuntime(
        agent,
        task,
        prevResults[prevResults.length - 1] || "",
        workspaceData.apiKey,
        workspaceData.mainLLM
      );
      console.log("BEFORE RUNNING AGENT", prevResults);
      const response = await agentRuntime.run();
      prevResults.push(response);
    }
    ws.send(
      JSON.stringify({
        type: "message",
        data: `Step ${prevResults.length} completed`,
        timestamp: new Date().toISOString(),
      })
    );
  }
  console.log(prevResults);

  // run the prompt throught the main LLM to get back the plan
  // parse plan
  // send event for plan created
  // run plan steps sequentially (Task graph of tasks that are executed in parallel or sequentially will be implemented in the future)
  // each step is exectuted through agent or workflow then result is returned
  // keep track of the results from each step to give to the next step as input
  // send final result and finished workspace execution event
  return prevResults;
};

export const yallma3GenSeqential = async (
  workspaceData: WorkspaceData,
  ws: WebSocket
) => {
  if (!workspaceData) return;

  let results: Record<string, string> = {};

  const taskGraph: TaskGraph = {
    tasks: workspaceData.tasks,
    connections: workspaceData.connections,
  };

  let consoleMessage: ConsoleEvent | null;

  const layers = getTaskExecutionOrderWithContext(taskGraph);
  const MainLLM = getLLMProvider(workspaceData.mainLLM, workspaceData.apiKey);
  let step = 1;

  for (const layer of layers) {
    let taskContext = "";
    let task = taskGraph.tasks.find((t) => t.id == layer.taskId);
    if (!task) continue;
    if (layer.taskId == task.id) {
      let i = 0;
      for (const cont of layer.context) {
        if (i > 0) {
          taskContext += ` , ${results[cont]}`;
        } else {
          taskContext = `${results[cont]}`;
        }
        i++;
      }
    }

    let bestFit = null;
    // Auto assigne best Tool, Workflow, Or Agent for the task
    if (task.type == "agentic") {
      consoleMessage = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "system",
        message: `Assigning task '${task.title}'...`,
      };
      ws.send(
        JSON.stringify({
          type: "message",
          data: consoleMessage,
          timestamp: new Date().toISOString(),
        })
      );
      bestFit = await assignBestFit(
        MainLLM,
        task,
        workspaceData.workflows,
        workspaceData.agents
      );
      consoleMessage = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "system",
        message: `Assigned task '${task.title}' to ${bestFit.type} '${
          bestFit.id
        }' with confidence: ${bestFit.confidence.toFixed(2)}.`,
      };
      ws.send(
        JSON.stringify({
          type: "message",
          data: consoleMessage,
          timestamp: new Date().toISOString(),
        })
      );
    }

    // Workflow Type
    if (task.type == "workflow" || bestFit?.type == "workflow") {
      const workflowId =
        task.type == "workflow" ? task.executorId : bestFit?.id;
      if (!workflowId) throw "no workflow id";

      consoleMessage = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "info",
        message: `[${step}/${layers.length}] Running task '${task.title}' (workflow: ${workflowId})`,
      };
      ws.send(
        JSON.stringify({
          type: "message",
          data: consoleMessage,
          timestamp: new Date().toISOString(),
        })
      );

      const finalResult = await workflowExecutor(ws, workflowId, taskContext);

      if (finalResult) {
        results[task.id] = finalResult;

        const consoleMessage: ConsoleEvent = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "success",
          message: `[${step}/${layers.length}] Task '${task.title}' completed successfully.`,
          results: finalResult,
        };
        console.log("Console event with result example: ", consoleMessage);
        ws.send(
          JSON.stringify({
            type: "message",
            data: consoleMessage,
            timestamp: new Date().toISOString(),
          })
        );
        step++;
      } else {
        consoleMessage = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "error",
          message: `[${step}/${layers.length}] Task '${task.title}' failed.`,
        };
        ws.send(
          JSON.stringify({
            type: "message",
            data: consoleMessage,
            timestamp: new Date().toISOString(),
          })
        );
      }
      continue;
    }
    consoleMessage = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "system",
      message: `Analysing task '${task.title}'...`,
    };
    ws.send(
      JSON.stringify({
        type: "message",
        data: consoleMessage,
        timestamp: new Date().toISOString(),
      })
    );

    const coreAnalysis = await analyzeTaskCore(MainLLM, task, taskContext);
    console.log(coreAnalysis);

    // Specific Agent Type with assigned agent
    if (task.type == "specific-agent" || bestFit?.type == "agent") {
      const agentId =
        task.type == "specific-agent" ? task.executorId : bestFit?.id;

      // Simple task proceed with agent to perform single task
      const agent = workspaceData.agents.find((a) => a.id == agentId);
      if (!agent) return;

      consoleMessage = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "info",
        message: `[${step}/${layers.length}] Running task '${task.title}' (Agent: ${agent.name})`,
      };
      ws.send(
        JSON.stringify({
          type: "message",
          data: consoleMessage,
          timestamp: new Date().toISOString(),
        })
      );

      let agentPlan: AgentStep[] | null = null;

      // Complex task needs decomposition
      // if (coreAnalysis.needsDecomposition) {
      //   subtasks = await decomposeTask(MainLLM, coreAnalysis);
      //   // proceed in case of subtasks
      // }

      consoleMessage = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: "info",
        message: `Creating agent plan...`,
      };
      ws.send(
        JSON.stringify({
          type: "message",
          data: consoleMessage,
          timestamp: new Date().toISOString(),
        })
      );

      try {
        // Simple task execute through agent directly
        agentPlan = await planAgenticTask(
          MainLLM,
          coreAnalysis,
          task,
          taskContext
        );
        consoleMessage = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "success",
          message: `Agent plan created successfully`,
          results: JSON.stringify(agentPlan, null, 2),
        };
        ws.send(
          JSON.stringify({
            type: "message",
            data: consoleMessage,
            timestamp: new Date().toISOString(),
          })
        );
      } catch (err) {
        console.error("[MainAgent] Agent plan creation failed:", err);
        consoleMessage = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "error",
          message: `Agent plan creation failed: ${err instanceof Error ? err.message : String(err)}`,
        };
        ws.send(
          JSON.stringify({
            type: "message",
            data: consoleMessage,
            timestamp: new Date().toISOString(),
          })
        );
      }

      if (!agentPlan) {
        consoleMessage = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "error",
          message: `Agent plan creation failed.`,
        };
        ws.send(
          JSON.stringify({
            type: "message",
            data: consoleMessage,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      const agentRuntime = new Yallma3GenOneAgentRuntime(
        agent,
        task,
        taskContext,
        agentPlan,
        ws,
        workspaceData.apiKey,
        workspaceData.mainLLM
      );

      const result = await agentRuntime.run();
      if (result) {
        results[task.id] = result;
        consoleMessage = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "success",
          message: `[${step}/${layers.length}] Task '${task.title}' completed successfully.`,
          results: result,
        };

        ws.send(
          JSON.stringify({
            type: "message",
            data: consoleMessage,
            timestamp: new Date().toISOString(),
          })
        );
        step++;
      } else {
        consoleMessage = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "error",
          message: `[${step}/${layers.length}] Task '${task.title}' failed.`,
        };

        ws.send(
          JSON.stringify({
            type: "message",
            data: consoleMessage,
            timestamp: new Date().toISOString(),
          })
        );
      }
    }

    console.log("Result for task:", task.id, ":", results[task.id]);
  }
  let finalResult: string;
  const finalTaskId = layers[layers.length - 1]?.taskId ?? "";

  finalResult = results[finalTaskId] || JSON.stringify(results, null, 2);

  consoleMessage = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "success",
    message: `Workspace completed successfully.`,
    results: finalResult,
  };

  ws.send(
    JSON.stringify({
      type: "message",
      data: consoleMessage,
      timestamp: new Date().toISOString(),
    })
  );

  // Save results to file
  try {
    const outputDir = "Output";
    await mkdir(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const workspaceName = workspaceData.name.replace(/\s+/g, "_");
    const filename = `${workspaceName}_${timestamp}.txt`;
    const filepath = join(outputDir, filename);

    const output = `${workspaceData.name} Workspace Execution Results
Generated: ${new Date().toISOString()}

${layers.map((l) => {
  const text = l.taskId + "\n" + results[l.taskId] + "\n\n";
  return text;
})}`;

    await writeFile(filepath, output, "utf8");
    console.log(`Results saved to: ${filepath}`);

    consoleMessage = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "success",
      message: `Results saved to ${filepath}`,
    };
    ws.send(
      JSON.stringify({
        type: "message",
        data: consoleMessage,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error("Failed to save results:", error);
    ws.send(
      JSON.stringify({
        type: "error",
        data: `Failed to save results: ${error}`,
        timestamp: new Date().toISOString(),
      })
    );
  }

  return results;
};
