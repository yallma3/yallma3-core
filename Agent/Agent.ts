import type { Agent, ReviewResult } from "../Models/Agent";
import type { AgentStep, Task } from "../Models/Task";
import { getLLMProvider } from "../LLM/LLMRunner";
import type { LLMProvider } from "../LLM/LLMProvider";
import type { LLMOption } from "../Models/LLM";

export class AgentRuntime {
  private agent: Agent;
  private task: Task;
  private context: string = "";
  private llm: LLMProvider;
  private apiKey: string;
  private maxIterations = 5;

  constructor(
    agent: Agent,
    task: Task,
    context: string,
    workspaceKey?: string,
    workspaceLLM?: LLMOption
  ) {
    this.agent = agent;
    this.task = task;
    this.context = context;
    this.apiKey = agent.apiKey || workspaceKey || "No Key Provided";

    const llmOption = agent.llm || workspaceLLM;
    this.llm = getLLMProvider(llmOption, this.apiKey);
  }
  async run(): Promise<string> {
    console.log("CONTEXRTT", this.context);
    let iteration = 0;
    let output = "";
    let feedback = "";

    while (iteration < this.maxIterations) {
      console.log("Iteration:", iteration);

      const prompt = this.buildPrompt(iteration, output, feedback);
      output = await this.llm.generateText(prompt);
      console.log("🧠 Agent Response: ", output);

      const reviewPrompt = this.buildReviewPrompt(output);
      const reviewResult = await this.llm.generateText(reviewPrompt);
      const reviewResultParsed = JSON.parse(reviewResult);
      if (reviewResultParsed.task_completion_status === "complete") {
        break;
      }
      feedback = reviewResultParsed.feedback;
      //   console.log("📝 Feedback:", feedback);

      iteration++;
    }
    return output;
  }

  private buildPrompt(
    iteration: number,
    previousResult: string,
    feedback: any
  ): string {
    let intro: string;

    if (iteration === 0) {
      intro = `You are ${this.agent.name}, a ${this.agent.role}.

            TASK: ${this.task.title}
            DESCRIPTION: ${this.task.description}

            Your objective is to deliver a high-quality response that meets all specified requirements.`;
    } else {
      // Parse feedback if it's a JSON object
      const parsedFeedback =
        typeof feedback === "string"
          ? feedback
          : JSON.stringify(feedback, null, 2);

      intro = `You are ${this.agent.name}, a ${this.agent.role}. You need to improve your previous response based on detailed feedback.

                TASK: ${this.task.title}
                DESCRIPTION: ${this.task.description}

                PREVIOUS RESULT:
                ${previousResult}

                DETAILED FEEDBACK:
                ${parsedFeedback}

                IMPROVEMENT INSTRUCTIONS:
                - Address all weaknesses and missing elements identified in the feedback
                - Implement the specific improvement suggestions provided
                - Maintain and build upon the strengths mentioned in the feedback
                - Ensure the response meets all accuracy and clarity standards
                - Focus particularly on areas marked as incomplete or inadequate`;
    }

    if (this.context) {
      intro += `Here is the input you should solve the task based on ${JSON.stringify(
        this.context,
        null,
        2
      )}`;
    }

    const completionInstructions = `
                EXPECTED OUTPUT FORMAT: ${this.task.expectedOutput}

                QUALITY STANDARDS:
                - Ensure your response is complete, accurate, and directly addresses the task
                - Structure your response clearly and logically
                - Provide comprehensive coverage of all required elements
                - Double-check that your output matches the expected format exactly
                - If examples or specific details are requested, include them
                - Maintain professional quality throughout your response

                Deliver a polished, final-quality response that fully satisfies the task requirements.`;

    return `${intro}\n${completionInstructions}`;
  }
  private buildReviewPrompt(response: string): string {
    return `You are a quality reviewer. Your task is to evaluate a response against specific requirements and provide your assessment as a JSON object.

        TASK NAME: ${this.task.title}
        TASK DESCRIPTION: ${this.task.description}
        EXPECTED OUTPUT: ${this.task.expectedOutput}

        RESPONSE TO REVIEW:
        ${response}

        EVALUATION CRITERIA:
        - VALID: Does the response directly address the core task requirements and stay on topic?
        - COMPLETE: Does the response fully satisfy all aspects of the expected output format, content depth, and scope?
        - ACCURACY: Is the information provided correct and reliable?
        - CLARITY: Is the response well-structured, clear, and easy to understand?

        Provide your assessment as a JSON object with this exact structure (no additional text, formatting, or code blocks):

        {
            "valid": true/false,
            "complete": true/false,
            "accuracy": true/false,
            "clarity": true/false,
            "overall_score": 0-100,
            "feedback": {
                "strengths": "List specific positive aspects of the response",
                "weaknesses": "List specific issues or gaps in the response", 
                "missing_elements": "Identify what key components are missing from the expected output",
                "improvement_suggestions": "Provide specific, actionable recommendations for the next iteration"
            },
            "task_completion_status": "complete"/"needs_revision"/"inadequate"
        }`;
  }

  agentProfile(): string {
    return "Agents info for Main Agent to help assigning to tasks";
  }
}

export class Yallma3GenOneAgentRuntime {
  private agent: Agent;
  private task: Task;
  private intent: string;
  private plan: AgentStep[];
  private context: string = "";
  private llm: LLMProvider;
  private apiKey: string;
  private maxIterations = 5;

  constructor(
    agent: Agent,
    task: Task,
    context: string,
    plan: AgentStep[],
    workspaceKey?: string,
    workspaceLLM?: LLMOption,
    intent?: string
  ) {
    this.agent = agent;
    this.task = task;
    this.plan = plan;
    this.context = context;
    this.apiKey = agent.apiKey || workspaceKey || "No Key Provided";

    const llmOption = agent.llm || workspaceLLM;
    this.llm = getLLMProvider(llmOption, this.apiKey);
    this.intent = intent || "";
  }

  async run(): Promise<string> {
    let iteration = 0;
    let output = "";
    let feedback: any = null;

    while (iteration < this.maxIterations) {
      console.log(`\n🔄 Iteration ${iteration + 1}/${this.maxIterations}`);

      // Step 1: Agent generates output
      const prompt = this.buildPrompt(iteration, output, feedback);
      output = await this.llm.generateText(prompt);
      console.log("🧠 Agent Response:\n", output);

      // Step 2: Review the output
      const reviewPrompt = this.buildReviewPrompt(output);
      const reviewRaw = await this.llm.generateText(reviewPrompt);

      let review: any;
      try {
        review = JSON.parse(reviewRaw);
      } catch {
        const match = reviewRaw.match(/(\{[\s\S]*\})/);
        if (match) {
          review = JSON.parse(match[1] ?? "");
        } else {
          throw new Error("❌ Failed to parse review JSON: " + reviewRaw);
        }
      }

      console.log("🔍 Review Result:", JSON.stringify(review, null, 2));

      // If the review says the task is complete → accept immediately
      if (review.task_completion_status === "complete") {
        console.log("🎉 Task marked complete by reviewer.");
        break;
      }

      // Step 3: Final acceptance check — only if revision is suggested
      if (
        review.task_completion_status === "needs_revision" ||
        review.task_completion_status === "inadequate"
      ) {
        const finalCheckPrompt = this.buildFinalCheckPrompt(output);
        const checkRaw = await this.llm.generateText(finalCheckPrompt);

        let finalCheck: any;
        try {
          finalCheck = JSON.parse(checkRaw);
        } catch {
          const match = checkRaw.match(/(\{[\s\S]*\})/);
          if (match) {
            finalCheck = JSON.parse(match[1] ?? "");
          } else {
            throw new Error("❌ Failed to parse final check JSON: " + checkRaw);
          }
        }

        console.log("✅ Final Check:", JSON.stringify(finalCheck, null, 2));

        if (finalCheck.accept) {
          console.log("🎉 Task accepted by final check.");
          break;
        } else {
          console.log("⚠️ Needs revision, applying feedback...");
          feedback = review.feedback;
        }
      }

      iteration++;
    }

    if (iteration >= this.maxIterations) {
      console.warn("⚠️ Max iterations reached, returning last output.");
    }

    return output;
  }

  private buildPrompt(
    iteration: number,
    previousResult: string,
    feedback: any
  ): string {
    let intro = `You are ${this.agent.name}, a highly skilled ${
      this.agent.role
    }.
    
  TASK INFORMATION:
  - TITLE: ${this.task.title}
  - INTENT: ${this.intent}
  - DESCRIPTION: ${this.task.description}
  - CONTEXT: ${
    this.context ? JSON.stringify(this.context, null, 2) : "No context provided"
  }
  
  Your objective is to deliver the best possible output by strictly following this plan:
  ${JSON.stringify(this.plan, null, 2)}
  `;

    if (iteration !== 0) {
      const parsedFeedback =
        typeof feedback === "string"
          ? feedback
          : JSON.stringify(feedback, null, 2);

      intro += `\nREVISION ROUND: You must now improve upon your previous response.
  
  PREVIOUS RESULT:
  ${previousResult}
  
  FEEDBACK TO APPLY:
  ${parsedFeedback}
  
  REVISION INSTRUCTIONS:
  - Fix all weaknesses and missing elements highlighted in the feedback
  - Apply all improvement suggestions exactly
  - Keep and strengthen the good parts of your last response
  - Ensure the new version is more complete, accurate, and clear than before
  - Focus particularly on elements marked as incomplete or inadequate`;
    }

    const completionInstructions = `
  EXPECTED OUTPUT FORMAT: ${this.task.expectedOutput}
  
  QUALITY STANDARDS:
  - Fully satisfy the expected format, structure, and requirements
  - Provide clear, logical, and professional output
  - Be comprehensive: cover all required elements in depth
  - Double-check accuracy, correctness, and formatting
  - Do not include reasoning steps, explanations, or extra commentary outside the final response
  
  Now deliver a polished, final-quality response.`;

    return `${intro}\n${completionInstructions}`;
  }
  private buildReviewPrompt(response: string): string {
    return `You are a strict quality reviewer. Your role is to evaluate the response against the task requirements and return JSON only (no text, no formatting, no commentary outside the JSON).
  
  TASK TITLE: ${this.task.title}
  TASK DESCRIPTION: ${this.task.description}
  EXPECTED OUTPUT FORMAT: ${this.task.expectedOutput}
  
  RESPONSE TO REVIEW:
  ${response}
  
  EVALUATION CRITERIA:
  - VALID: Does the response stay on-topic and address the task requirements?
  - COMPLETE: Does it cover all elements required in the expected output?
  - ACCURACY: Is the information factually correct and reliable?
  - CLARITY: Is it well-structured, concise, and easy to understand?
  
  STRICTLY RETURN JSON WITH THIS EXACT SHAPE:
  {
    "valid": true/false,
    "complete": true/false,
    "accuracy": true/false,
    "clarity": true/false,
    "overall_score": 0-100,
    "feedback": {
      "strengths": "List specific positive aspects of the response",
      "weaknesses": "List specific issues or flaws in the response",
      "missing_elements": "List the missing requirements from the expected output",
      "improvement_suggestions": "Provide actionable next steps to improve the response"
    },
    "task_completion_status": "complete" | "needs_revision" | "inadequate"
  }`;
  }
  private buildFinalCheckPrompt(response: string): string {
    return `You are the final evaluator. Your task is to decide if the current response is good enough to stop the iteration loop, or if more revisions are required. 
  
  TASK TITLE: ${this.task.title}
  TASK DESCRIPTION: ${this.task.description}
  EXPECTED OUTPUT FORMAT: ${this.task.expectedOutput}
  
  CURRENT RESPONSE:
  ${response}
  
  DECISION CRITERIA:
  - COMPLETE: Does the response fully meet the expected output format and requirements?
  - ACCURATE: Is it factually correct and reliable?
  - CLEAR: Is it structured, logical, and easy to understand?
  - QUALITY: Is it professional, polished, and ready for final delivery?
  
  You must return STRICT JSON only (no commentary, no extra text) with this exact shape:
  
  {
    "accept": true/false,            // true if the response is final-quality and no more iterations are needed
    "reason": "string",              // explain why it is acceptable or why it needs more work
    "next_action": "deliver" | "revise" // "deliver" if accept=true, "revise" if accept=false
  }`;
  }

  agentProfile(): string {
    return "Agents info for Main Agent to help assigning to tasks";
  }
}
