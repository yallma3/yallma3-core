import type { ExecutionContext, WorkflowMessage } from "./ExecutionContext";

export function sendWorkflow(
  ctx: ExecutionContext,
  workflowId: string,
  input?: string,
  timeoutMs = 60000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    let timeoutId: ReturnType<typeof setTimeout>;

    const handler = (msg: WorkflowMessage) => {
      if (msg.type === "workflow_json" && msg.id === requestId) {
        clearTimeout(timeoutId);
        resolve(JSON.stringify(msg.data));
      }
      if (msg.type === "error" && msg.requestId === requestId) {
        clearTimeout(timeoutId);
        reject((msg.message as string) || "Workflow execution failed");
      }
    };

    ctx.onMessage(handler);

    const msg: WorkflowMessage = {
      id: requestId,
      type: "run_workflow",
      requestId,
      data: workflowId,
      context: input,
      timestamp: new Date().toISOString(),
    };

    ctx.send(msg);

    timeoutId = setTimeout(() => {
      reject(new Error(`Workflow ${workflowId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}
