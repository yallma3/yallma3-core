import { runLLM } from "../LLM/LLMRunner";
import type { LLMProvider } from "../LLM/LLMProvider";
import type {
  InterpretationResult,
  TaskGraph,
  Task,
  SubTask,
  AgentStep,
  CoreTaskAnalysis,
} from "../Models/Task";

/**
 * Produce a structured interpretation of an execution TaskGraph into per-task metadata.
 *
 * Parses the LLM's JSON output into an InterpretationResult that contains an `interpretedTasks` array with each task's intent, entities, execution constraints, context (inputs/outputs/feedsInto), classification, optional `formatForNext`, and optional decomposition hints.
 *
 * @param graph - The execution graph to interpret; its JSON form is provided to the LLM as input.
 * @returns An InterpretationResult object with an `interpretedTasks` array describing each task's extracted metadata.
 *
 * @throws If the LLM does not return valid JSON parseable into an InterpretationResult.
 */
export async function interpretExecutionGraph(
  llm: LLMProvider,
  graph: TaskGraph
): Promise<InterpretationResult> {
  const prompt = `
  You are an intelligent agent.
  
  Your job:
  - For each task in the execution graph, extract:
    - intent
    - entities (array of strings)
    - constraints:
        executorType (string)
        executorId (string or null)
        dataTypes (array of strings)
    - context:
        inputs (array of strings)
        outputs (array of strings)
        feedsInto (array of numbers)
    - classification: one of "simple", "one_tool_call", or "complex"
    - formatForNext (optional string)
    - decomposition (optional array of strings if classification is "complex")
  
  Output requirements:
  - Return a valid JSON object only.
  - No  \`\`\` before or after
  - Do not include explanations, comments, or text outside the JSON.
  - The output must strictly match this shape:
  
  {
    "interpretedTasks": [
      {
        "taskId": "string",
        "intent": "string",
        "entities": ["string"],
        "execution": {
          "executorType": "string",
          "executorId": "string or null",
        },
        "context": {
          "inputs": ["id1", "id2], // ids of tasks that their input is needed to complete task
          "external": "websearch"  // any external tool needed to be called to get some context to help in the task INCLUDE ONLY IF NECCESSARY
        },
        "classification": "simple | one_tool_call | complex",
        "formatForNext": "string (optional)", // if some formatting is needed for the next task that it feeds into
        "decomposition": true | false (optional) // if the task is too complex and needs decomposition into smaller sub tasks
      }
    ]
  }
  
  Here is the graph:
  
  ${JSON.stringify(graph, null, 2)}
  `;

  const response = await runLLM(llm, prompt);

  return JSON.parse(response) as InterpretationResult;
}

/**
 * Produce a concise core analysis of a single task for downstream planning and decomposition.
 *
 * The result contains the task's canonical intent, a simple classification, whether it requires decomposition,
 * and any required user-provided input.
 *
 * @param context - Optional additional context to include when analyzing the task
 * @returns A `CoreTaskAnalysis` object with fields: `taskId`, `intent`, `classification` (`simple | one_tool_call | complex`), `needsDecomposition`, and `userInput`.
 * @throws Error if the LLM response cannot be parsed as the expected JSON `CoreTaskAnalysis`
 */
export async function analyzeTaskCore(
  llm: LLMProvider,
  task: Task,
  context?: string
): Promise<CoreTaskAnalysis> {
  const prompt = `
  You are an expert task analyst. Your job is to analyze a single task.
  
  Output STRICT JSON with this shape only:
  {
    "taskId": "string",
    "intent": "string",                      // rewrite title/description/output into a form easier for an LLM to understand and act on
    "classification": "simple|one_tool_call|complex",
    "needsDecomposition": true|false,        // true if task is too complex and must be broken down
    "userInput": "string or null"      // if a user input is needed to start or complete the task
  }
  
  Task JSON:
  ${JSON.stringify(task, null, 2)}
  
  Additional Context:
  ${context ? JSON.stringify(context) : "null"}
  `;

  const raw = await runLLM(llm, prompt);
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed) as CoreTaskAnalysis;
  } catch {
    const match = trimmed.match(/(\{[\s\S]*\})/);
    if (match) {
      return JSON.parse(match[1] ?? "") as CoreTaskAnalysis;
    }
    throw new Error("Failed to parse core task analysis: " + trimmed);
  }
}

/**
 * Decomposes a task marked for decomposition into an array of atomic, self-contained subtasks.
 *
 * @param coreAnalysis - Core analysis of the task; its `intent` will be used as the decomposition target (should indicate `needsDecomposition`).
 * @returns An array of subtasks where each subtask has `id`, `title`, `description`, and `expectedOutput`.
 * @throws Error if the LLM output cannot be parsed as the expected JSON array of subtasks.
 */
export async function decomposeTask(
  llm: LLMProvider,
  coreAnalysis: CoreTaskAnalysis
): Promise<SubTask[]> {
  const prompt = `
  You are an expert task planner. The following task was marked as "needsDecomposition".
  
  Break it down into smaller subtasks. Each subtask should be:
  - Atomic (can be done in one step/tool call if possible)
  - Clear (easy for another agent or tool to execute)
  - Self-contained with its own expected output
  
  Output STRICT JSON as an array of subtasks:
  [
    {
      "id": "string",             // unique id, can be "sub1", "sub2", ...
      "title": "string",
      "description": "string",
      "expectedOutput": "string"
    }
  ]
  
  Task intent:
  ${coreAnalysis.intent}
  `;

  const raw = await runLLM(llm, prompt);
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed) as SubTask[];
  } catch {
    const match = trimmed.match(/(\[[\s\S]*\])/);
    if (match) {
      return JSON.parse(match[1] ?? "") as SubTask[];
    }
    throw new Error("Failed to parse decomposition: " + trimmed);
  }
}

/**
 * Produce a sequential, JSON-formatted plan of agent steps for an agentic task.
 *
 * Each step will contain `id`, `action`, `rationale`, and `expectedOutput`.
 *
 * @param coreAnalysis - Core analysis for the task; its `intent` guides the plan
 * @param task - The task's metadata (title, description, expectedOutput) used to shape steps
 * @param context - Optional additional context to inform planning
 * @returns An array of steps where each step has `id`, `action`, `rationale`, and `expectedOutput`
 * @throws If the LLM response cannot be parsed as a JSON array of steps
 */
export async function planAgenticTask(
  llm: LLMProvider,
  coreAnalysis: CoreTaskAnalysis,
  task: Task,
  context?: string
): Promise<AgentStep[]> {
  const prompt = `
  You are an expert agent planner. The following task is of type "agentic".
  
  Create a sequential plan of steps the agent should follow. Each step should:
  - Describe one clear action
  - Explain briefly why it is needed
  - Define what the expected output will be
  
  Output STRICT JSON as an array of steps:
  [
    {
      "id": "string",            // unique id, like "step1", "step2"
      "action": "string",        // what the agent does
      "rationale": "string",     // why this step matters
      "expectedOutput": "string" // the result of this step
    }
  ]
  Task: ${task.title}, ${task.description}
  Task intent:
  ${coreAnalysis.intent}
  Expected Output: ${task.expectedOutput}
  Context: ${context}
  `;

  const raw = await runLLM(llm, prompt);
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed) as AgentStep[];
  } catch {
    const match = trimmed.match(/(\[[\s\S]*\])/);
    if (match) {
      return JSON.parse(match[1] ?? "") as AgentStep[];
    }
    throw new Error("Failed to parse agentic plan: " + trimmed);
  }
}

// Quick notes & recommended improvements

// Use schema-enforced LLM calls (OpenAI response schema / function-calling or a similar capability) to guarantee JSON output reliably — far less brittle than regex extraction.

// Few-shot examples: include 1–2 example task → expected JSON pairs in the prompt; this drastically reduces parsing/format errors.

// Temperature = 0 for deterministic plans (set in your runLLM options if supported).

// Validate/normalize output with a runtime schema (zod/io-ts) after parse, and auto-retry or re-prompt the model if validation fails.

// If you need plan execution later, consider returning structured tools with exact API signatures and sample calls (so agents can auto-wire).

// Optional extras that help orchestration: estimated effort, priority, risk level, required credentials/permissions.