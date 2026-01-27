import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { AlarmRecord, AlarmInput } from '../types/alarm';

export class AlarmService {
    private static unlistenFn: UnlistenFn | null = null;

    /**
     * Subscribe to alarm changes
     */
    static async subscribe(callback: (alarms: AlarmRecord[]) => void): Promise<UnlistenFn> {
        this.unlistenFn = await listen<AlarmRecord[]>('alarms:changed', (event) => {
            callback(event.payload);
        });
        return this.unlistenFn;
    }

    /**
     * Unsubscribe from alarm changes
     */
    static async unsubscribe() {
        if (this.unlistenFn) {
            this.unlistenFn();
            this.unlistenFn = null;
        }
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
}
