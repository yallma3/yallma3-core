import { telegramTriggerManager } from './TelegramTriggerManager';

type TelegramMessage = {
  message_id: number;
  from?: Record<string, unknown>;
  chat: Record<string, unknown>;
  date: number;
  text?: string;
  [key: string]: unknown;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  inline_query?: Record<string, unknown>;
  callback_query?: Record<string, unknown>;
  poll?: Record<string, unknown>;
  poll_answer?: Record<string, unknown>;
  pre_checkout_query?: Record<string, unknown>;
  shipping_query?: Record<string, unknown>;
  [key: string]: unknown;
};

type TelegramJob = {
  workspaceId: string;
  update: TelegramUpdate;
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
      const success = await telegramTriggerManager.directExecute(job.workspaceId, job.update);
      
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
