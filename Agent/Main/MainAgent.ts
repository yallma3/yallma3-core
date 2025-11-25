import { WebSocket } from "ws";

export interface MainAgent {
  /** Version number like "1.0.0" */
  version: string;

  /**
   * Executes the agent runtime.
   * Returns key-value results.
   */
  run(): Promise<Record<string, string>>;
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
