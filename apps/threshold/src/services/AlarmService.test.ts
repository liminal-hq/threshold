import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlarmService } from './AlarmService';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { AlarmMode, AlarmRecord, AlarmInput } from '../types/alarm';

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
        mode: AlarmMode.Fixed,
        fixedTime: '07:00',
        windowStart: null,
        windowEnd: null,
        activeDays: [1, 2, 3, 4, 5],
        nextTrigger: 1625097600000,
        soundUri: 'test_uri',
        soundTitle: 'Test Sound',
    };

    describe('subscribe', () => {
        it('should setup batch update listener and fetch alarms', async () => {
            const mockUnlisten = vi.fn();
            (listen as any).mockResolvedValue(mockUnlisten);
            const callback = vi.fn();
            (invoke as any).mockResolvedValue([mockAlarm]);

            const unlisten = await AlarmService.subscribe(callback);

            expect(listen).toHaveBeenCalledWith('alarms:batch:updated', expect.any(Function));
            expect(unlisten).toEqual(expect.any(Function));

            const eventHandler = (listen as any).mock.calls[0][1];
            await eventHandler({ payload: { updatedIds: [1], revision: 2, timestamp: 123 } });

            expect(invoke).toHaveBeenCalledWith('get_alarms');
            expect(callback).toHaveBeenCalledWith([mockAlarm]);
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
            await AlarmService.unsubscribe();
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
                mode: AlarmMode.Fixed,
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

    describe('snooze', () => {
        it('should invoke snooze_alarm with minutes', async () => {
            (invoke as any).mockResolvedValue(undefined);

            await AlarmService.snooze(1, 10);

            expect(invoke).toHaveBeenCalledWith('snooze_alarm', { id: 1, minutes: 10 });
        });
    });

    describe('reportFired', () => {
        it('should invoke report_alarm_fired', async () => {
            (invoke as any).mockResolvedValue(undefined);

            await AlarmService.reportFired(1, 123456);

            expect(invoke).toHaveBeenCalledWith('report_alarm_fired', { id: 1, actualFiredAt: 123456 });
        });
    });

    describe('requestSync', () => {
        it('should invoke request_alarm_sync', async () => {
            (invoke as any).mockResolvedValue(undefined);

            await AlarmService.requestSync('FORCE_SYNC');

            expect(invoke).toHaveBeenCalledWith('request_alarm_sync', { reason: 'FORCE_SYNC' });
        });
    });
});
