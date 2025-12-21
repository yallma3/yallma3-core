import { WebSocket } from "ws";

export interface MainAgent {
  /** Version number like "1.0.0" */
  version: string;

  /**
   * Executes the agent runtime.
   * Returns key-value results.
   */
  run(): Promise<Record<string, string>>;
  abort(): void;
}

export function sendWorkflow(
  ws: WebSocket,
  workflow: string,
  timeoutMs = 30000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    let timeoutId: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      ws.off("message", listener);
      clearTimeout(timeoutId);
    };

    let timeoutId: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      ws.off("message", listener);
      clearTimeout(timeoutId);
    };

    const listener = (message: WebSocket.RawData) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === "workflow_json" && data.id === requestId) {
          cleanup();
          resolve(JSON.stringify(data.data));
        }
      } catch {
        // Ignore parse errors for unrelated messages
      }
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `Workflow request ${requestId} timed out after ${timeoutMs}ms`
        )
      );
    }, timeoutMs);

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
