
export type TriggerType = 'scheduled' | 'webhook' | 'manual' | 'telegram';

export interface BaseTrigger {
  id: string;
  type: TriggerType;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ScheduledTrigger extends BaseTrigger {
  type: 'scheduled';
  config: {
    cronExpression: string;
    timezone: string;
    description?: string;
    nextRun?: number;
  };
}

export interface WebhookTrigger extends BaseTrigger {
  type: 'webhook';
  config: {
    webhookUrl: string;
    webhookId?: string;
    secret?: string;
    method: 'POST' | 'GET';
    path?: string;
  };
}

export interface ManualTrigger extends BaseTrigger {
  type: 'manual';
  config: {
    description?: string;
    requiresConfirmation?: boolean;
  };
}

export type TelegramUpdateType = 
  | 'message'
  | 'edited_message'
  | 'channel_post'
  | 'edited_channel_post'
  | 'inline_query'
  | 'callback_query'
  | 'poll'
  | 'poll_answer'
  | 'pre_checkout_query'
  | 'shipping_query';

export interface TelegramTrigger extends BaseTrigger {
  type: 'telegram';
  config: {
    botToken: string;
    webhookUrl?: string;
    secretToken?: string;
    updateTypes: TelegramUpdateType[];
    filterChatId?: string;
    filterChatType?: 'private' | 'group' | 'supergroup' | 'channel';
    botInfo?: {
      id: number;
      username: string;
      first_name: string;
      can_join_groups: boolean;
      can_read_all_group_messages: boolean;
    };
  };
}

export type Trigger = ScheduledTrigger | WebhookTrigger | ManualTrigger | TelegramTrigger;

/**
 * Validates if a trigger configuration is valid
 */
export function validateTrigger(trigger: Trigger): boolean {
  if (!trigger.id || !trigger.type || trigger.enabled === undefined) {
    return false;
  }

  switch (trigger.type) {
    case 'scheduled':
      return Boolean(
        trigger.config.cronExpression && 
        trigger.config.timezone
      );
    
    case 'webhook':
      return Boolean(trigger.config.method);
    
    case 'manual':
      return true;
    
    case 'telegram':
      return Boolean(
        trigger.config.botToken &&
        trigger.config.botToken.includes(':') &&
        trigger.config.updateTypes &&
        trigger.config.updateTypes.length > 0
      );
    
    default:
      return false;
  }
}

/**
 * Creates a default trigger configuration
 */
export function createDefaultTrigger(type: TriggerType): Trigger {
  const now = Date.now();
  const baseConfig = {
    id: `trigger-${now}`,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  switch (type) {
    case 'scheduled':
      return {
        ...baseConfig,
        type: 'scheduled',
        config: {
          cronExpression: '0 9 * * *',
          timezone: 'UTC',
        },
      };

    case 'webhook':
      return {
        ...baseConfig,
        type: 'webhook',
        config: {
          webhookUrl: '',
          method: 'POST',
        },
      };

    case 'manual':
      return {
        ...baseConfig,
        type: 'manual',
        config: {},
      };

    case 'telegram':
      return {
        ...baseConfig,
        type: 'telegram',
        config: {
          botToken: '',
          updateTypes: ['message'],
        },
      };
  }
}
