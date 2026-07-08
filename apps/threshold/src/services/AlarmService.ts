import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { AlarmRecord, AlarmInput } from '../types/alarm';

export class AlarmService {
    /**
     * Subscribe to alarm changes. Returns a cleanup function for this
     * specific subscription -- call it to stop listening.
     */
    static async subscribe(callback: (alarms: AlarmRecord[]) => void): Promise<UnlistenFn> {
        return await listen('alarms:batch:updated', async () => {
            const alarms = await this.getAll();
            callback(alarms);
        });
    }

    /**
     * Get all alarms
     */
    static async getAll(): Promise<AlarmRecord[]> {
        return await invoke<AlarmRecord[]>('get_alarms');
    }

    /**
     * Get single alarm
     */
    static async get(id: number): Promise<AlarmRecord> {
        return await invoke<AlarmRecord>('get_alarm', { id });
    }

    /**
     * Create or update alarm
     */
    static async save(alarm: AlarmInput): Promise<AlarmRecord> {
        return await invoke<AlarmRecord>('save_alarm', { alarm });
    }

    /**
     * Toggle alarm on/off
     */
    static async toggle(id: number, enabled: boolean): Promise<AlarmRecord> {
        return await invoke<AlarmRecord>('toggle_alarm', { id, enabled });
    }

    /**
     * Delete alarm
     */
    static async delete(id: number): Promise<void> {
        await invoke('delete_alarm', { id });
    }

    /**
     * Dismiss ringing alarm
     */
    static async dismiss(id: number): Promise<void> {
        await invoke('dismiss_alarm', { id });
    }

    /**
     * Snooze ringing alarm
     */
    static async snooze(id: number, snoozedUntil: number): Promise<void> {
        await invoke('snooze_alarm', { id, snoozedUntil });
    }

    /**
     * Report a fired alarm (lifecycle event)
     */
    static async reportFired(id: number, actualFiredAt: number): Promise<void> {
        await invoke('report_alarm_fired', { id, actualFiredAt });
    }

    /**
     * Request an explicit alarm sync.
     */
    static async requestSync(
        reason: 'BATCH_COMPLETE' | 'INITIALIZE' | 'RECONNECT' | 'FORCE_SYNC',
    ): Promise<void> {
        await invoke('request_alarm_sync', { reason });
    }
}
