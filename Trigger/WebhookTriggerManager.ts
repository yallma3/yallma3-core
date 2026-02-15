import type { WebhookTrigger } from "../Models/Trigger";
import * as crypto from "crypto";

interface WebhookRegistration {
  workspaceId: string;
  trigger: WebhookTrigger;
  webhookUrl: string;
}

export class WebhookTriggerManager {
  private webhooks: Map<string, WebhookRegistration> = new Map();
  private onWebhookTrigger?: (workspaceId: string, payload: any) => void;
  private baseUrl: string = "http://localhost:3001";

  constructor(baseUrl?: string) {
    if (baseUrl) this.baseUrl = baseUrl;
  }

  setExecutionCallback(callback: (workspaceId: string, payload: any) => void) {
    this.onWebhookTrigger = callback;
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private generateSecret(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Register or update webhook for a workspace
   */
  registerWebhook(
    workspaceId: string,
    trigger: WebhookTrigger
  ): {
    success: boolean;
    error?: string;
    webhookUrl?: string;
    secret?: string;
  } {
    try {
      const secret = trigger.config.secret || this.generateSecret();

      const path = `/webhook/${workspaceId}`;
      const webhookUrl = `${this.baseUrl}${path}`;

      const updatedTrigger: WebhookTrigger = {
        ...trigger,
        config: {
          ...trigger.config,
          webhookUrl,
          secret,
          method: trigger.config.method ?? "POST",
          path,
        },
      };

      this.webhooks.set(workspaceId, {
        workspaceId,
        trigger: updatedTrigger,
        webhookUrl,
      });

      console.log(` Webhook registered for workspace: ${workspaceId}`);
      console.log(`   URL: ${webhookUrl}`);
      console.log(`   Secret: ${secret}`);

      return {
        success: true,
        webhookUrl,
        secret,
      };
    } catch (error) {
      console.error(
        `❌ Failed to register webhook for workspace ${workspaceId}:`,
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  unregisterWebhook(workspaceId: string): boolean {
    const existed = this.webhooks.delete(workspaceId);
    if (existed) {
      console.log(`🗑️  Webhook unregistered for workspace: ${workspaceId}`);
    }
    return existed;
  }

  unregisterWorkspaceWebhooks(workspaceId: string): number {
    // backward‑compat alias; we only have one per workspace now
    return this.unregisterWebhook(workspaceId) ? 1 : 0;
  }

  /**
   * Validate webhook request (workspaceId + optional secret)
   */
  validateWebhook(
    workspaceId: string,
    providedSecret?: string
  ): WebhookRegistration | null {
    const registration = this.webhooks.get(workspaceId);

    if (!registration) {
      console.warn(`⚠️  Webhook not found for workspace: ${workspaceId}`);
      return null;
    }

    const expectedSecret = registration.trigger.config.secret;
    //if (expectedSecret && expectedSecret !== providedSecret)
    if (expectedSecret && providedSecret && providedSecret !== expectedSecret) {
      console.warn(`⚠️  Invalid secret for workspace webhook: ${workspaceId}`);
      return null;
    }

    return registration;
  }

  /**
   * Used by the queue worker: execute without re‑validation
   */
  directExecute(workspaceId: string, payload: any): boolean {
    if (!this.onWebhookTrigger) {
      console.warn(
        `⚠️  No execution callback set for workspace webhook: ${workspaceId}`
      );
      return false;
    }

    console.log(`🔗 Webhook job executing for workspace: ${workspaceId}`);
    this.onWebhookTrigger(workspaceId, payload);
    return true;
  }

  /**
   * Get basic info for debugging
   */
  getWebhookInfo(workspaceId: string): {
    exists: boolean;
    workspaceId?: string;
    webhookUrl?: string;
    hasSecret?: boolean;
  } {
    const registration = this.webhooks.get(workspaceId);
    if (!registration) return { exists: false };

    return {
      exists: true,
      workspaceId: registration.workspaceId,
      webhookUrl: registration.webhookUrl,
      hasSecret: !!registration.trigger.config.secret,
    };
  }

  getWorkspaceWebhooks(workspaceId: string): WebhookRegistration[] {
    const registration = this.webhooks.get(workspaceId);
    return registration ? [registration] : [];
  }

  getAllWebhooks(): {
    workspaceId: string;
    webhookUrl: string;
  }[] {
    const out: { workspaceId: string; webhookUrl: string }[] = [];
    this.webhooks.forEach((reg) => {
      out.push({
        workspaceId: reg.workspaceId,
        webhookUrl: reg.webhookUrl,
      });
    });
    return out;
  }
}

export const webhookTriggerManager = new WebhookTriggerManager();
