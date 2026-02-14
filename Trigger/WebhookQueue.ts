import { webhookTriggerManager } from "./WebhookTriggerManager";

type WebhookJob = {
  workspaceId: string;
  payload: any;
};

class WebhookQueue {
  private queue: WebhookJob[] = [];
  private processing = false;

  enqueue(job: WebhookJob) {
    this.queue.push(job);
    console.log(
      `Enqueued webhook job for workspace ${job.workspaceId}. Queue length: ${this.queue.length}`
    );
    this.processNext();
  }

  private async processNext() {
    if (this.processing) return;

    const job = this.queue.shift();
    if (!job) return;

    this.processing = true;

    try {
      webhookTriggerManager.directExecute(job.workspaceId, job.payload);
    } catch (err) {
      console.error("❌ Webhook job failed:", err);
    } finally {
      this.processing = false;
      if (this.queue.length > 0) {
        setImmediate(() => this.processNext());
      }
    }
  }
}

export const webhookQueue = new WebhookQueue();
