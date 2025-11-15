import { describe, it, expect, beforeEach } from 'vitest';
import { setConsoleEvents, addConsoleEvent, getLastUserInputAfter, ConsoleInputUtils } from '../../../Workflow/Nodes/ConsoleInput';
import type { ConsoleEvent } from '../../../Models/Workspace';

describe('ConsoleInput Utilities', () => {
  beforeEach(() => {
    // Reset global state before each test
    ConsoleInputUtils.clearEvents();
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
      expect(ConsoleInputUtils.getCurrentEvents()).toHaveLength(1);
      expect(ConsoleInputUtils.getCurrentEvents()[0].id).toBe('1');
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
      expect(currentEvents[0].id).toBe('101');
      expect(currentEvents[99].id).toBe('2');
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
  });
});