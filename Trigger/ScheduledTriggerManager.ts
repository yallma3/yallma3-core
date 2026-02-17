
import { CronJob } from 'cron';
import type { ScheduledTrigger } from '../Models/Trigger';

interface TriggerJob {
  job: CronJob;
  trigger: ScheduledTrigger;
  workspaceId: string;
  running: boolean;
}

export class ScheduledTriggerManager {
  private jobs: Map<string, TriggerJob> = new Map();
  private onTriggerExecute?: (workspaceId: string) => void;

  /**
   * Set the callback for when a trigger fires
   */
  setExecutionCallback(callback: (workspaceId: string) => void) {
    this.onTriggerExecute = callback;
  }

  /**
   * Get next execution time as Unix timestamp
   */
  getNextExecutionTime(workspaceId: string): number | null {
    const triggerJob = this.jobs.get(workspaceId);
    
    if (!triggerJob || !triggerJob.running) {
      return null;
    }

    try {
      const nextDate = triggerJob.job.nextDate();
      if (nextDate) {
        return nextDate.toJSDate().getTime(); 
      }
    } catch (error) {
      console.error(`Error getting next execution time for ${workspaceId}:`, error);
    }
    
    return null;
  }

  /**
   * Register a new scheduled trigger
   */
  registerTrigger(
    workspaceId: string,
    trigger: ScheduledTrigger
  ): { success: boolean; error?: string; nextExecutionTime?: number } {
    try {
      this.unregisterTrigger(workspaceId);

      const job = new CronJob(
        trigger.config.cronExpression,
        () => {
          console.log(` Trigger fired for workspace: ${workspaceId}`);
          this.executeWorkspace(workspaceId);
        },
        null,
        false,
        trigger.config.timezone || 'UTC'
      );

      // Store the job
      this.jobs.set(workspaceId, {
        job,
        trigger,
        workspaceId,
        running: false,
      });

      // Start the job if trigger is enabled
      if (trigger.enabled) {
        job.start();
        const storedJob = this.jobs.get(workspaceId);
        if (storedJob) storedJob.running = true;

        const nextExecutionTime = this.getNextExecutionTime(workspaceId);

        console.log(` Trigger registered and started for workspace: ${workspaceId}`);
        console.log(`   Cron: ${trigger.config.cronExpression}`);
        console.log(`   Timezone: ${trigger.config.timezone || 'UTC'}`);
        if (nextExecutionTime) {
          console.log(`   Next run: ${new Date(nextExecutionTime).toISOString()}`);
        }

        return { success: true, nextExecutionTime: nextExecutionTime || undefined };
      }

      return { success: true };
    } catch (error) {
      console.error(` Failed to register trigger for workspace ${workspaceId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Unregister a trigger for a workspace
   */
  unregisterTrigger(workspaceId: string): boolean {
    const triggerJob = this.jobs.get(workspaceId);
    
    if (triggerJob) {
      triggerJob.job.stop();
      this.jobs.delete(workspaceId);
      console.log(` Trigger unregistered for workspace: ${workspaceId}`);
      return true;
    }
    
    return false;
  }

  /**
   * Get trigger status for a workspace
   */
  getStatus(workspaceId: string): {
    active: boolean;
    nextRun: Date | null;
    nextExecutionTime: number | null;
    trigger: ScheduledTrigger | null;
  } {
    const triggerJob = this.jobs.get(workspaceId);
    
    if (!triggerJob) {
      return { active: false, nextRun: null, nextExecutionTime: null, trigger: null };
    }

    const isRunning = triggerJob.running;
    const nextRun = isRunning ? triggerJob.job.nextDate().toJSDate() : null;
    const nextExecutionTime = this.getNextExecutionTime(workspaceId);

    return {
      active: isRunning,
      nextRun,
      nextExecutionTime,
      trigger: triggerJob.trigger,
    };
  }

  /**
   * Get all active triggers
   */
  getAllTriggers(): { 
    workspaceId: string; 
    trigger: ScheduledTrigger; 
    nextRun: Date | null;
    nextExecutionTime: number | null;
  }[] {
    const triggers: { 
      workspaceId: string; 
      trigger: ScheduledTrigger; 
      nextRun: Date | null;
      nextExecutionTime: number | null;
    }[] = [];
    
    this.jobs.forEach((triggerJob, workspaceId) => {
      const nextRun = triggerJob.running 
        ? triggerJob.job.nextDate().toJSDate() 
        : null;
      const nextExecutionTime = this.getNextExecutionTime(workspaceId);
      
      triggers.push({
        workspaceId,
        trigger: triggerJob.trigger,
        nextRun,
        nextExecutionTime,
      });
    });

    return triggers;
  }

  /**
   * Execute workspace when trigger fires
   */
  private executeWorkspace(workspaceId: string) {
    if (this.onTriggerExecute) {
      this.onTriggerExecute(workspaceId);
    } else {
      console.warn(` No execution callback set for triggered workspace: ${workspaceId}`);
    }
  }

  /**
   * Stop all triggers (cleanup)
   */
  stopAll() {
    console.log('Stopping all triggers...');
    this.jobs.forEach((triggerJob, workspaceId) => {
      triggerJob.job.stop();
      triggerJob.running = false;
      console.log(`   Stopped trigger for workspace: ${workspaceId}`);
    });
    this.jobs.clear();
  }
}

// Singleton instance
export const scheduledTriggerManager = new ScheduledTriggerManager();
