import type { Agent, ReviewResult } from "../Models/Agent";
import type { Task } from "../Models/Task";
import { getLLMProvider, runLLM } from "../LLM/LLMRunner";
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
      console.log("📝 Feedback:", feedback);

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

            TASK: ${this.task.name}
            DESCRIPTION: ${this.task.description}

            Your objective is to deliver a high-quality response that meets all specified requirements.`;
    } else {
      // Parse feedback if it's a JSON object
      const parsedFeedback =
        typeof feedback === "string"
          ? feedback
          : JSON.stringify(feedback, null, 2);

      intro = `You are ${this.agent.name}, a ${this.agent.role}. You need to improve your previous response based on detailed feedback.

                TASK: ${this.task.name}
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

        TASK NAME: ${this.task.name}
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
}
