import { telegramTriggerManager } from './TelegramTriggerManager';

type TelegramJob = {
  workspaceId: string;
  update: any;
};

class TelegramQueue {
  private queue: TelegramJob[] = [];
  private processing = false;

  enqueue(job: TelegramJob) {
    this.queue.push(job);
    this.processNext();
  }

  private async processNext() {
    if (this.processing) return;

    const job = this.queue.shift();
    if (!job) return;

    this.processing = true;
    console.log(`[TelegramQueue]  Processing update for workspace ${job.workspaceId}`);

    try {
      const success = telegramTriggerManager.directExecute(job.workspaceId, job.update);
      
      if (success) {
        console.log(`[TelegramQueue]  Update processed successfully`);
      } else {
        console.log(`[TelegramQueue]  Update was filtered or rejected`);
      }
    } catch (err) {
      console.error('[TelegramQueue]  Job failed:', err);
    } finally {
      this.processing = false;
      
      if (this.queue.length > 0) {
        console.log(`[TelegramQueue] 📊 ${this.queue.length} updates remaining in queue`);
        setImmediate(() => this.processNext());
      }
    }
  }

  /**
   * Get queue status for monitoring
   */
  getStatus(): {
    queueLength: number;
    isProcessing: boolean;
  } {
    return {
      queueLength: this.queue.length,
      isProcessing: this.processing
    };
  }

  /**
   * Clear all pending jobs (for cleanup/testing)
   */
  clear(): number {
    const count = this.queue.length;
    this.queue = [];
    console.log(`[TelegramQueue] Cleared ${count} pending updates`);
    return count;
  }
}

export const telegramQueue = new TelegramQueue();
