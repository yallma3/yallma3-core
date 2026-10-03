import { WebSocket } from "ws";
import { Helper } from "../Utils/Helper";

export interface WorkflowMessage {
  type: string;
  id?: string;
  requestId?: string;
  data?: unknown;
  context?: string;
  message?: string;
  timestamp?: string;
}

export interface ExecutionContext {
  requestId?: string;
  send(message: WorkflowMessage): Promise<void>;
  onMessage(handler: (msg: WorkflowMessage) => void): void;
  onClose(handler: () => void): () => void;
  broadcast(data: unknown): void;
  triggerData?: unknown;
}

export class WebSocketContext implements ExecutionContext {
  triggerData?: unknown;

  constructor(
    private ws: WebSocket,
    private broadcastFn: (data: unknown) => void
  ) {}

  async send(message: WorkflowMessage): Promise<void> {
    this.ws.send(JSON.stringify(message));
  }

  onMessage(handler: (msg: WorkflowMessage) => void): void {
    this.ws.on("message", (raw: WebSocket.RawData) => {
      const parsed = Helper.JsonParser.safeParse(raw.toString());
      if (parsed.success) {
        handler(parsed.data as WorkflowMessage);
      }
    });
  }

  onClose(handler: () => void): () => void {
    this.ws.on("close", handler);
    this.ws.on("error", handler);
    return () => {
      this.ws.off("close", handler);
      this.ws.off("error", handler);
    };
  }

  broadcast(data: unknown): void {
    this.broadcastFn(data);
  }
}

export class TriggerExecutionContext implements ExecutionContext {
  private handlers: Array<(msg: WorkflowMessage) => void> = [];
  triggerData?: unknown;

  constructor(private broadcastFn: (data: unknown) => void) {}

  async send(message: WorkflowMessage): Promise<void> {
    for (const handler of this.handlers) {
      handler(message);
    }
  }

  onMessage(handler: (msg: WorkflowMessage) => void): void {
    this.handlers.push(handler);
  }

  onClose(): () => void {
    return () => {};
  }

  broadcast(data: unknown): void {
    this.broadcastFn(data);
  }
}
