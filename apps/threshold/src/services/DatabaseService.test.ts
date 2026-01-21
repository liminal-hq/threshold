import { describe, it, expect, vi, beforeEach } from 'vitest';
import { databaseService } from './DatabaseService';
import Database from '@tauri-apps/plugin-sql';

// Mock @tauri-apps/plugin-sql
vi.mock('@tauri-apps/plugin-sql', () => {
    return {
        default: {
            load: vi.fn()
        }
    };
});

describe('DatabaseService', () => {
    let mockDb: any;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset the singleton instance
        (databaseService as any).db = null;
        (databaseService as any).initPromise = null;

        mockDb = {
            execute: vi.fn().mockResolvedValue({ lastInsertId: 1 }),
            select: vi.fn().mockResolvedValue([]),
        };

        (Database.load as any).mockResolvedValue(mockDb);
    });

    it('should pass correct types to sqlite when disabling an alarm', async () => {
        // Init the service
        await databaseService.init();

        const alarmToSave = {
            id: 123,
            label: 'Test Alarm',
            enabled: false, // Disabling
            mode: 'FIXED' as any,
            fixedTime: '10:00',
            activeDays: [],
            nextTrigger: undefined, // Cleared trigger
            soundUri: null,
            soundTitle: null
        };

        await databaseService.saveAlarm(alarmToSave);

        const calls = mockDb.execute.mock.calls;
        const updateCall = calls.find((args: any[]) => args[0].includes('UPDATE alarms SET'));

        expect(updateCall).toBeDefined();
        const params = updateCall[1];

        console.log('Execute called with params:', params);

        // params[1] is enabled
        // params[7] is next_trigger

        // We expect conversion to 0 (integer) and null (for SQL NULL)
        expect(params[1]).toBe(0);
        expect(params[7]).toBe(null);
    });
});
