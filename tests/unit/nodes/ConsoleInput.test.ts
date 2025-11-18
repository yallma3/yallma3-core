import { describe, it, expect, beforeEach } from 'vitest';
import { 
  setConsoleEvents, 
  addConsoleEvent, 
  getLastUserInputAfter, 
  ConsoleInputUtils,
  registerPrompt,
  resolvePrompt,
  getInputForPrompt,
  getPendingPrompts,
  cleanupPrompts
} from '../../../Workflow/Nodes/ConsoleInput';
import type { ConsoleEvent } from '../../../Models/Workspace';

describe('ConsoleInput Utilities', () => {
  beforeEach(() => {
    // Reset global state before each test
    ConsoleInputUtils.clearEvents();
    // Clear any pending prompts from previous tests
    const pending = getPendingPrompts();
    pending.forEach(p => {
      if (p) {
        resolvePrompt(p.promptId, 'cleanup');
      }
    });
    ConsoleInputUtils.cleanupPrompts(0); // Clean up all prompts
  });

  describe('setConsoleEvents', () => {
    it('should set the global console events array', () => {
      const events: ConsoleEvent[] = [
        {
          id: '1',
          timestamp: 1000,
          type: 'info',
          message: 'Test message 1',
          details: 'Detail 1',
        },
        {
          id: '2',
          timestamp: 2000,
          type: 'error',
          message: 'Test message 2',
          details: 'Detail 2',
        },
      ];

      setConsoleEvents(events);

      expect(ConsoleInputUtils.getCurrentEvents()).toEqual(events);
    });

    it('should create a copy of the events array', () => {
      const events: ConsoleEvent[] = [
        {
          id: '1',
          timestamp: 1000,
          type: 'info',
          message: 'Test message',
        },
      ];

      setConsoleEvents(events);
      events.push({
        id: '2',
        timestamp: 2000,
        type: 'error',
        message: 'Another message',
      });

      // The global events should not be affected by changes to the original array
      const currentEvents = ConsoleInputUtils.getCurrentEvents();
      expect(currentEvents).toHaveLength(1);
      const firstEvent = currentEvents[0];
      expect(firstEvent).toBeDefined();
      expect(firstEvent?.id).toBe('1');
    });
  });

  describe('addConsoleEvent', () => {
    it('should add event to the beginning of the array', () => {
      const event1: ConsoleEvent = {
        id: '1',
        timestamp: 1000,
        type: 'info',
        message: 'First message',
      };

      const event2: ConsoleEvent = {
        id: '2',
        timestamp: 2000,
        type: 'error',
        message: 'Second message',
      };

      addConsoleEvent(event1);
      addConsoleEvent(event2);

      const currentEvents = ConsoleInputUtils.getCurrentEvents();
      expect(currentEvents).toHaveLength(2);
      expect(currentEvents[0]).toEqual(event2); // Most recent first
      expect(currentEvents[1]).toEqual(event1);
    });

    it('should limit events to 100 items', () => {
      // Add 101 events
      for (let i = 1; i <= 101; i++) {
        addConsoleEvent({
          id: i.toString(),
          timestamp: i * 1000,
          type: 'info',
          message: `Message ${i}`,
        });
      }

      const currentEvents = ConsoleInputUtils.getCurrentEvents();
      expect(currentEvents).toHaveLength(100);
      // The most recent 100 events should be kept
      const firstEvent = currentEvents[0];
      const lastEvent = currentEvents[99];
      expect(firstEvent).toBeDefined();
      expect(lastEvent).toBeDefined();
      expect(firstEvent?.id).toBe('101');
      expect(lastEvent?.id).toBe('2');
    });
  });

  describe('Prompt Management', () => {
    describe('registerPrompt', () => {
      it('should register a new prompt', () => {
        const promptId = 'test_prompt_1';
        const nodeId = 123;

        registerPrompt(promptId, nodeId);

        const pending = getPendingPrompts();
        expect(pending).toHaveLength(1);
        const firstPrompt = pending[0];
        expect(firstPrompt).toBeDefined();
        expect(firstPrompt?.promptId).toBe(promptId);
        expect(firstPrompt?.nodeId).toBe(nodeId);
        expect(firstPrompt?.resolved).toBe(false);
      });
    });

    describe('resolvePrompt', () => {
      it('should resolve a registered prompt', () => {
        const promptId = 'test_prompt_2';
        registerPrompt(promptId, 123);

        const resolved = resolvePrompt(promptId, 'user response');

        expect(resolved).toBe(true);
        expect(getInputForPrompt(promptId)).toBe('user response');
      });

      it('should not resolve an already resolved prompt', () => {
        const promptId = 'test_prompt_3';
        registerPrompt(promptId, 123);
        resolvePrompt(promptId, 'first response');

        const resolved = resolvePrompt(promptId, 'second response');

        expect(resolved).toBe(false);
        expect(getInputForPrompt(promptId)).toBe('first response');
      });

      it('should return false for non-existent prompt', () => {
        const resolved = resolvePrompt('non_existent', 'response');
        expect(resolved).toBe(false);
      });
    });

    describe('getInputForPrompt', () => {
      it('should return null for unresolved prompt', () => {
        const promptId = 'test_prompt_4';
        registerPrompt(promptId, 123);

        expect(getInputForPrompt(promptId)).toBe(null);
      });

      it('should return response for resolved prompt', () => {
        const promptId = 'test_prompt_5';
        registerPrompt(promptId, 123);
        resolvePrompt(promptId, 'test response');

        expect(getInputForPrompt(promptId)).toBe('test response');
      });

      it('should return null for non-existent prompt', () => {
        expect(getInputForPrompt('non_existent')).toBe(null);
      });
    });

    describe('getPendingPrompts', () => {
      it('should return only unresolved prompts', () => {
        registerPrompt('prompt1', 1);
        registerPrompt('prompt2', 2);
        registerPrompt('prompt3', 3);

        resolvePrompt('prompt2', 'resolved');

        const pending = getPendingPrompts();
        expect(pending).toHaveLength(2);
        const promptIds = pending.map(p => p?.promptId).filter((id): id is string => !!id);
        expect(promptIds).toContain('prompt1');
        expect(promptIds).toContain('prompt3');
        expect(promptIds).not.toContain('prompt2');
      });

      it('should return empty array when no prompts exist', () => {
        expect(getPendingPrompts()).toHaveLength(0);
      });
    });

    describe('cleanupPrompts', () => {
      it('should remove prompts older than maxAge', async () => {
        registerPrompt('old_prompt', 1);
        
        // Wait a bit then register a new prompt
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            registerPrompt('new_prompt', 2);
            
            // Clean up prompts older than 50ms
            cleanupPrompts(50);
            
            const pending = getPendingPrompts();
            expect(pending).toHaveLength(1);
            const firstPrompt = pending[0];
            expect(firstPrompt).toBeDefined();
            expect(firstPrompt?.promptId).toBe('new_prompt');
            resolve();
          }, 100);
        });
      });

      it('should use default maxAge of 300000ms', () => {
        registerPrompt('recent_prompt', 1);
        
        cleanupPrompts(); // No maxAge specified
        
        // Should not be cleaned up as it's recent
        expect(getPendingPrompts()).toHaveLength(1);
      });
    });
  });

  describe('getLastUserInputAfter', () => {
    it('should return the message of the most recent user input event after the given timestamp', () => {
      const events: ConsoleEvent[] = [
        {
          id: '4',
          timestamp: 4000,
          type: 'info',
          message: 'User input 2',
          details: 'User input',
        },
        {
          id: '3',
          timestamp: 3000,
          type: 'info',
          message: 'Another system message',
          details: 'Some detail',
        },
        {
          id: '2',
          timestamp: 2000,
          type: 'info',
          message: 'User input 1',
          details: 'User input',
        },
        {
          id: '1',
          timestamp: 1000,
          type: 'info',
          message: 'System message',
          details: 'Some detail',
        },
      ];

      setConsoleEvents(events);

      expect(getLastUserInputAfter(1500)).toBe('User input 2'); // Most recent after 1500
      expect(getLastUserInputAfter(2500)).toBe('User input 2'); // Only one after 2500
      expect(getLastUserInputAfter(4500)).toBe(null); // None after 4500
    });

    it('should return null when no user input events exist after the timestamp', () => {
      const events: ConsoleEvent[] = [
        {
          id: '1',
          timestamp: 1000,
          type: 'info',
          message: 'Old user input',
          details: 'User input',
        },
      ];

      setConsoleEvents(events);

      expect(getLastUserInputAfter(2000)).toBe(null);
    });

    it('should return null when no events exist', () => {
      expect(getLastUserInputAfter(0)).toBe(null);
    });

    it('should only consider events with details equal to "User input"', () => {
      const events: ConsoleEvent[] = [
        {
          id: '1',
          timestamp: 1000,
          type: 'info',
          message: 'User message',
          details: 'Something else',
        },
        {
          id: '2',
          timestamp: 2000,
          type: 'info',
          message: 'Actual user input',
          details: 'User input',
        },
      ];

      setConsoleEvents(events);

      expect(getLastUserInputAfter(0)).toBe('Actual user input');
    });
  });

  describe('ConsoleInputUtils', () => {
    describe('updateEvents', () => {
      it('should update events using setConsoleEvents', () => {
        const events: ConsoleEvent[] = [
          {
            id: '1',
            timestamp: 1000,
            type: 'info',
            message: 'Updated message',
          },
        ];

        ConsoleInputUtils.updateEvents(events);

        expect(ConsoleInputUtils.getCurrentEvents()).toEqual(events);
      });
    });

    describe('addEvent', () => {
      it('should add event using addConsoleEvent', () => {
        const event: ConsoleEvent = {
          id: '1',
          timestamp: 1000,
          type: 'info',
          message: 'Test message',
        };

        ConsoleInputUtils.addEvent(event);

        expect(ConsoleInputUtils.getCurrentEvents()).toEqual([event]);
      });
    });

    describe('getCurrentEvents', () => {
      it('should return a copy of the current events array', () => {
        const event: ConsoleEvent = {
          id: '1',
          timestamp: 1000,
          type: 'info',
          message: 'Test message',
        };

        addConsoleEvent(event);

        const currentEvents = ConsoleInputUtils.getCurrentEvents();
        expect(currentEvents).toEqual([event]);

        // Modifying the returned array should not affect the global state
        currentEvents.push({
          id: '2',
          timestamp: 2000,
          type: 'error',
          message: 'Another message',
        });

        expect(ConsoleInputUtils.getCurrentEvents()).toHaveLength(1);
      });
    });

    describe('clearEvents', () => {
      it('should clear all events', () => {
        addConsoleEvent({
          id: '1',
          timestamp: 1000,
          type: 'info',
          message: 'Test message',
        });

        expect(ConsoleInputUtils.getCurrentEvents()).toHaveLength(1);

        ConsoleInputUtils.clearEvents();

        expect(ConsoleInputUtils.getCurrentEvents()).toHaveLength(0);
      });
    });

    describe('resolvePrompt via Utils', () => {
      it('should resolve prompt through ConsoleInputUtils', () => {
        registerPrompt('test_prompt', 1);
        
        const resolved = ConsoleInputUtils.resolvePrompt('test_prompt', 'response');
        
        expect(resolved).toBe(true);
        expect(getInputForPrompt('test_prompt')).toBe('response');
      });
    });

    describe('getPendingPrompts via Utils', () => {
      it('should get pending prompts through ConsoleInputUtils', () => {
        registerPrompt('prompt1', 1);
        registerPrompt('prompt2', 2);
        
        const pending = ConsoleInputUtils.getPendingPrompts();
        
        expect(pending).toHaveLength(2);
      });
    });

    describe('cleanupPrompts via Utils', () => {
      it('should cleanup prompts through ConsoleInputUtils', async () => {
        registerPrompt('old_prompt', 1);
        
        // Wait a bit to ensure the prompt is old enough
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Clean up prompts older than 5ms
        ConsoleInputUtils.cleanupPrompts(5);
        
        expect(getPendingPrompts()).toHaveLength(0);
      });
    });
  });
});