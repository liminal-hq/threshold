import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlarmService } from './AlarmService';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AlarmRecord, AlarmInput } from '../types/alarm';

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(),
}));

describe('AlarmService', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    const mockAlarm: AlarmRecord = {
        id: 1,
        label: 'Morning',
        enabled: true,
        mode: 'FIXED',
        fixedTime: '07:00',
        windowStart: null,
        windowEnd: null,
        activeDays: [1, 2, 3, 4, 5],
        nextTrigger: 1625097600000,
        soundUri: 'test_uri',
        soundTitle: 'Test Sound',
    };

    describe('subscribe', () => {
        it('should setup event listener', async () => {
            const mockUnlisten = vi.fn();
            (listen as any).mockResolvedValue(mockUnlisten);
            const callback = vi.fn();

            const unlisten = await AlarmService.subscribe(callback);

            expect(listen).toHaveBeenCalledWith('alarms:changed', expect.any(Function));
            expect(unlisten).toBe(mockUnlisten);

            // Simulate event
            const eventHandler = (listen as any).mock.calls[0][1];
            const eventPayload = [mockAlarm];
            eventHandler({ payload: eventPayload });
            expect(callback).toHaveBeenCalledWith(eventPayload);
        });
    });

    describe('unsubscribe', () => {
        it('should call unlisten function if subscribed', async () => {
            const mockUnlisten = vi.fn();
            (listen as any).mockResolvedValue(mockUnlisten);
            await AlarmService.subscribe(vi.fn());

            await AlarmService.unsubscribe();

            expect(mockUnlisten).toHaveBeenCalled();
        });

        it('should do nothing if not subscribed', async () => {
            // No mock setup needed as subscribe wasn't called
            await AlarmService.unsubscribe();
            // Should just not throw
        });
    });

    describe('getAll', () => {
        it('should invoke get_alarms', async () => {
            (invoke as any).mockResolvedValue([mockAlarm]);

            const result = await AlarmService.getAll();

            expect(invoke).toHaveBeenCalledWith('get_alarms');
            expect(result).toEqual([mockAlarm]);
        });
    });

    describe('get', () => {
        it('should invoke get_alarm with id', async () => {
            (invoke as any).mockResolvedValue(mockAlarm);

            const result = await AlarmService.get(1);

            expect(invoke).toHaveBeenCalledWith('get_alarm', { id: 1 });
            expect(result).toEqual(mockAlarm);
        });
    });

    describe('save', () => {
        it('should invoke save_alarm with input', async () => {
            (invoke as any).mockResolvedValue(mockAlarm);
            const input: AlarmInput = {
                enabled: true,
                mode: 'FIXED',
                activeDays: [],
            };

            const result = await AlarmService.save(input);

            expect(invoke).toHaveBeenCalledWith('save_alarm', { alarm: input });
            expect(result).toEqual(mockAlarm);
        });
    });

    describe('toggle', () => {
        it('should invoke toggle_alarm', async () => {
            (invoke as any).mockResolvedValue(mockAlarm);

            const result = await AlarmService.toggle(1, true);

            expect(invoke).toHaveBeenCalledWith('toggle_alarm', { id: 1, enabled: true });
            expect(result).toEqual(mockAlarm);
        });
    });

    describe('delete', () => {
        it('should invoke delete_alarm', async () => {
            (invoke as any).mockResolvedValue(undefined);

            await AlarmService.delete(1);

            expect(invoke).toHaveBeenCalledWith('delete_alarm', { id: 1 });
        });
    });

    describe('dismiss', () => {
        it('should invoke dismiss_alarm', async () => {
            (invoke as any).mockResolvedValue(undefined);

            await AlarmService.dismiss(1);

            expect(invoke).toHaveBeenCalledWith('dismiss_alarm', { id: 1 });
        });
    });
});
