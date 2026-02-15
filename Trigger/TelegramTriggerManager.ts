import axios from 'axios';
import * as crypto from 'crypto';
import type { TelegramTrigger, TelegramUpdateType } from '../Models/Trigger';

type TelegramUpdate = {
  update_id: number;
  message?: any;
  edited_message?: any;
  channel_post?: any;
  edited_channel_post?: any;
  inline_query?: any;
  callback_query?: any;
  poll?: any;
  poll_answer?: any;
  pre_checkout_query?: any;
  shipping_query?: any;
  [key: string]: any;
};

interface TelegramRegistration {
  workspaceId: string;
  trigger: TelegramTrigger;
  webhookUrl: string;
  botInfo: {
    id: number;
    username: string;
    first_name: string;
    can_join_groups: boolean;
    can_read_all_group_messages: boolean;
  };
}

export class TelegramTriggerManager {
  private bots: Map<string, TelegramRegistration> = new Map();
  private onTelegramUpdate?: (workspaceId: string, update: TelegramUpdate) => Promise<void>;
  private baseUrl: string = 'http://localhost:3001';

  constructor(baseUrl?: string) {
    if (baseUrl) this.baseUrl = baseUrl;
  }

  setExecutionCallback(callback: (workspaceId: string, update: TelegramUpdate) => Promise<void>) {
    this.onTelegramUpdate = callback;
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Register Telegram webhook with Bot API
   */
  async registerTelegramBot(
    workspaceId: string,
    trigger: TelegramTrigger
  ): Promise<{
    success: boolean;
    error?: string;
    webhookUrl?: string;
    secretToken?: string;
    botInfo?: any;
  }> {
    try {
      const botToken = trigger.config.botToken;
      
      // Validate bot token format
      if (!botToken || !botToken.includes(':')) {
        return { 
          success: false, 
          error: 'Invalid bot token format. Expected format: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz' 
        };
      }

      // Validate update types
      if (!trigger.config.updateTypes || trigger.config.updateTypes.length === 0) {
        return {
          success: false,
          error: 'At least one update type must be selected'
        };
      }

      console.log(`[Telegram] Registering bot for workspace: ${workspaceId}`);
      console.log(`[Telegram] Selected update types:`, trigger.config.updateTypes);

      // Generate secret token for webhook security
      const secretToken = trigger.config.secretToken || 
        crypto.randomBytes(32).toString('hex');

      // Build webhook URL
      const path = `/telegram/${workspaceId}`;
      const webhookUrl = `${this.baseUrl}${path}`;

      // Step 1: Get bot info
      console.log(`[Telegram] Fetching bot info...`);
      const botInfoResponse = await axios.get(
        `https://api.telegram.org/bot${botToken}/getMe`,
        { timeout: 10000 }
      );

      if (!botInfoResponse.data.ok) {
        return { 
          success: false, 
          error: `Bot verification failed: ${botInfoResponse.data.description}` 
        };
      }

      const botInfo = botInfoResponse.data.result;
      console.log(`[Telegram]  Bot verified: @${botInfo.username} (${botInfo.first_name})`);

      // Step 2: Delete any existing webhook first (cleanup)
      try {
        await axios.post(
          `https://api.telegram.org/bot${botToken}/deleteWebhook`,
          { drop_pending_updates: true },
          { timeout: 10000 }
        );
        console.log(`[Telegram] Cleaned up old webhook`);
      } catch (cleanupError) {
        console.warn(`[Telegram] Webhook cleanup failed (non-critical):`, cleanupError);
      }

      // Step 3: Register webhook with Telegram
      console.log(`[Telegram] Registering webhook: ${webhookUrl}`);
      const setWebhookResponse = await axios.post(
        `https://api.telegram.org/bot${botToken}/setWebhook`,
        {
          url: webhookUrl,
          secret_token: secretToken,
          allowed_updates: trigger.config.updateTypes,
          max_connections: 40,
          drop_pending_updates: false
        },
        { timeout: 10000 }
      );

      if (!setWebhookResponse.data.ok) {
        return {
          success: false,
          error: `Webhook registration failed: ${setWebhookResponse.data.description}`
        };
      }

      // Store registration
      const updatedTrigger: TelegramTrigger = {
        ...trigger,
        config: {
          ...trigger.config,
          webhookUrl,
          secretToken,
          botInfo
        }
      };

      this.bots.set(workspaceId, {
        workspaceId,
        trigger: updatedTrigger,
        webhookUrl,
        botInfo
      });
      
      if (trigger.config.filterChatId) {
        console.log(`[Telegram]    Filter: Chat ID ${trigger.config.filterChatId}`);
      }
      if (trigger.config.filterChatType) {
        console.log(`[Telegram]    Filter: Chat type ${trigger.config.filterChatType}`);
      }

      return {
        success: true,
        webhookUrl,
        secretToken,
        botInfo
      };
    } catch (error) {
      console.error(`[Telegram] ❌ Registration failed:`, error);
      
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          return {
            success: false,
            error: 'Telegram API request timed out. Please try again.'
          };
        }
        if (error.response) {
          return {
            success: false,
            error: `Telegram API error: ${error.response.data?.description || error.message}`
          };
        }
        if (error.request) {
          return {
            success: false,
            error: 'Cannot reach Telegram API. Check your internet connection.'
          };
        }
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Unregister Telegram webhook
   */
  async unregisterTelegramBot(workspaceId: string): Promise<boolean> {
    const registration = this.bots.get(workspaceId);
    
    if (!registration) {
      console.log(`[Telegram] No registration found for: ${workspaceId}`);
      return false;
    }

    try {
      const botToken = registration.trigger.config.botToken;
      
      console.log(`[Telegram] Unregistering bot: @${registration.botInfo.username}`);
      
      // Delete webhook from Telegram
      await axios.post(
        `https://api.telegram.org/bot${botToken}/deleteWebhook`,
        { drop_pending_updates: true },
        { timeout: 10000 }
      );

      this.bots.delete(workspaceId);
      console.log(`[Telegram]  Bot unregistered: ${workspaceId}`);
      
      return true;
    } catch (error) {
      console.error(`[Telegram] Failed to unregister bot:`, error);
      
      // Still remove from local registry even if Telegram API fails
      this.bots.delete(workspaceId);
      return false;
    }
  }

  /**
   * Validate incoming Telegram update
   */
  validateUpdate(
    workspaceId: string,
    secretToken?: string
  ): TelegramRegistration | null {
    const registration = this.bots.get(workspaceId);

    if (!registration) {
      console.warn(`[Telegram]  Bot not registered for workspace: ${workspaceId}`);
      return null;
    }

    // Verify secret token
    const expectedSecret = registration.trigger.config.secretToken;
    if (expectedSecret && secretToken !== expectedSecret) {
      console.warn(`[Telegram]  Invalid secret token for workspace: ${workspaceId}`);
      return null;
    }

    return registration;
  }

  /**
   * Execute workspace with Telegram update (called by queue)
   */
  async directExecute(workspaceId: string, update: TelegramUpdate): Promise<boolean> {
    const registration = this.bots.get(workspaceId);
    
    if (!registration) {
      console.warn(`[Telegram] ⚠️ No registration found for: ${workspaceId}`);
      return false;
    }

    try {
      // Extract update type
      const updateType = this.getUpdateType(update);
      
      if (!updateType) {
        console.warn(`[Telegram]  Unknown update type:`, Object.keys(update));
        return false;
      }

      // Check if update type is in allowed list
      if (!registration.trigger.config.updateTypes.includes(updateType)) {
        console.log(`[Telegram]  Update filtered: "${updateType}" not in allowed types`);
        return false;
      }

      // Filter by chat ID if configured
      const filterChatId = registration.trigger.config.filterChatId;
      if (filterChatId) {
        const chatId = this.extractChatId(update);
        
        if (!chatId || chatId.toString() !== filterChatId) {
          console.log(`[Telegram]  Update filtered: chat ID ${chatId} doesn't match ${filterChatId}`);
          return false;
        }
      }

      // Filter by chat type if configured
      const filterChatType = registration.trigger.config.filterChatType;
      if (filterChatType) {
        const chatType = this.extractChatType(update);
        
        if (chatType !== filterChatType) {
          console.log(`[Telegram]  Update filtered: chat type "${chatType}" doesn't match "${filterChatType}"`);
          return false;
        }
      }

      if (!this.onTelegramUpdate) {
        console.warn(`[Telegram]  No execution callback set`);
        return false;
      }

      console.log(`[Telegram]    Executing workspace via "${updateType}" update`);
      console.log(`[Telegram]    Workspace: ${workspaceId}`);
      console.log(`[Telegram]    Bot: @${registration.botInfo.username}`);
      console.log(`[Telegram]    Update ID: ${update.update_id}`);
      
      await this.onTelegramUpdate(workspaceId, update);
      return true;
    } catch (error) {
      console.error(`[Telegram]  Execution error:`, error);
      return false;
    }
  }

  /**
   * Get update type from Telegram update object
   */
  private getUpdateType(update: TelegramUpdate): TelegramUpdateType | null {
    const possibleTypes: TelegramUpdateType[] = [
      'message',
      'edited_message',
      'channel_post',
      'edited_channel_post',
      'inline_query',
      'callback_query',
      'poll',
      'poll_answer',
      'pre_checkout_query',
      'shipping_query'
    ];

    for (const type of possibleTypes) {
      if (update[type]) {
        return type;
      }
    }

    return null;
  }

  /**
   * Extract chat ID from various update types
   */
  private extractChatId(update: TelegramUpdate): number | null {
    return update.message?.chat?.id ||
           update.edited_message?.chat?.id ||
           update.channel_post?.chat?.id ||
           update.edited_channel_post?.chat?.id ||
           update.callback_query?.message?.chat?.id ||
           null;
  }

  /**
   * Extract chat type from update
   */
  private extractChatType(update: TelegramUpdate): string | null {
    return update.message?.chat?.type ||
           update.edited_message?.chat?.type ||
           update.channel_post?.chat?.type ||
           update.edited_channel_post?.chat?.type ||
           update.callback_query?.message?.chat?.type ||
           null;
  }

  /**
   * Get bot registration info for debugging
   */
  getBotInfo(workspaceId: string): {
    exists: boolean;
    workspaceId?: string;
    webhookUrl?: string;
    botInfo?: any;
    updateTypes?: TelegramUpdateType[];
    filters?: {
      chatId?: string;
      chatType?: string;
    };
  } {
    const registration = this.bots.get(workspaceId);
    
    if (!registration) {
      return { exists: false };
    }

    return {
      exists: true,
      workspaceId: registration.workspaceId,
      webhookUrl: registration.webhookUrl,
      botInfo: registration.botInfo,
      updateTypes: registration.trigger.config.updateTypes,
      filters: {
        chatId: registration.trigger.config.filterChatId,
        chatType: registration.trigger.config.filterChatType
      }
    };
  }

  /**
   * Get all registered bots
   */
  getAllBots(): {
    workspaceId: string;
    botUsername: string;
    webhookUrl: string;
    updateTypes: TelegramUpdateType[];
  }[] {
    const bots: any[] = [];
    
    this.bots.forEach((registration) => {
      bots.push({
        workspaceId: registration.workspaceId,
        botUsername: registration.botInfo.username,
        webhookUrl: registration.webhookUrl,
        updateTypes: registration.trigger.config.updateTypes
      });
    });

    return bots;
  }

  /**
   * Check if a bot is registered for workspace
   */
  isRegistered(workspaceId: string): boolean {
    return this.bots.has(workspaceId);
  }
}

// Singleton instance
export const telegramTriggerManager = new TelegramTriggerManager();
