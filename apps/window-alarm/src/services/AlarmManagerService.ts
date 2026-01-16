import { databaseService, Alarm } from './DatabaseService';
import { invoke } from '@tauri-apps/api/core';
import { AlarmMode, DayOfWeek } from '@window-alarm/core/types';
import { calculateNextTrigger as calcTrigger } from '@window-alarm/core/scheduler';

// Define the plugin invoke types manually since we can't import from the plugin in this environment
interface ScheduleRequest {
  id: number;
  triggerAt: number;
}

interface CancelRequest {
  id: number;
}

interface ImportedAlarm {
  id: number;
  hour: number;
  minute: number;
  label: string;
}

export class AlarmManagerService {

  async init() {
    await databaseService.init();
    await this.checkImports();
  }

  async loadAlarms(): Promise<Alarm[]> {
    return await databaseService.getAllAlarms();
  }

  // Check for alarms created natively (e.g. via "Set Alarm" intent)
  private async checkImports() {
    try {
        const imports = await invoke<ImportedAlarm[]>('plugin:alarm-manager|get_launch_args');
        if (imports && imports.length > 0) {
            console.log("Importing native alarms:", imports);
            for (const imp of imports) {
                // Convert simple Hour/Min to proper Fixed Alarm
                const timeStr = \`\${imp.hour.toString().padStart(2, '0')}:\${imp.minute.toString().padStart(2, '0')}\`;

                const newAlarm: Omit<Alarm, 'id'> & { id?: number } = {
                    id: imp.id, // Use the ID generated natively to prevent duplication if possible
                    label: imp.label,
                    mode: 'FIXED',
                    fixedTime: timeStr,
                    activeDays: [0,1,2,3,4,5,6], // Default to every day for external sets? Or just once?
                    // Android default for "Set Alarm" is often non-repeating.
                    // But our app logic requires active days for `calculateNextTrigger`.
                    // Let's assume non-repeating isn't fully supported by our scheduler yet (it requires activeDays).
                    // So we default to "Every Day" for now.
                    enabled: true
                };

                // We use saveAndSchedule to ensure SQLite is synced and the native alarm
                // (which is already scheduled, but this confirms it) matches our logic.
                await this.saveAndSchedule(newAlarm);
            }
        }
    } catch (e) {
        console.error("Failed to check imports", e);
    }
  }

  async toggleAlarm(alarm: Alarm, enabled: boolean) {
    const updatedAlarm = { ...alarm, enabled };
    if (enabled) {
      this.rescheduleAlarm(updatedAlarm);
    } else {
      await this.cancelNativeAlarm(alarm.id);
      await databaseService.saveAlarm({ ...updatedAlarm, nextTrigger: undefined });
    }
  }

  // Added missing reschedule helper
  private async rescheduleAlarm(alarm: Alarm) {
      return this.saveAndSchedule(alarm);
  }

  async saveAndSchedule(alarm: Omit<Alarm, 'id'> & { id?: number }) {
    // 1. Calculate next trigger
    // Map UI Alarm type to Core Alarm type if needed, or ensure they match
    // Cast activeDays to DayOfWeek[]
    const coreAlarm = {
        ...alarm,
        id: alarm.id || 0, // Temp ID for calc
        activeDays: alarm.activeDays as DayOfWeek[]
    };

    const nextTrigger = calcTrigger(coreAlarm);

    // 2. Save to DB
    const id = await databaseService.saveAlarm({
        ...alarm,
        nextTrigger: nextTrigger ?? undefined
    });

    // 3. Schedule Native
    if (alarm.enabled && nextTrigger) {
        await this.scheduleNativeAlarm(id, nextTrigger);
    } else {
        await this.cancelNativeAlarm(id);
    }
  }

  async deleteAlarm(id: number) {
    await this.cancelNativeAlarm(id);
    await databaseService.deleteAlarm(id);
  }

  private async scheduleNativeAlarm(id: number, timestamp: number) {
    console.log(`Scheduling alarm ${id} for ${new Date(timestamp).toLocaleString()}`);
    try {
        await invoke('plugin:alarm-manager|schedule', {
            payload: { id, triggerAt: timestamp }
        });
    } catch (e) {
        console.error("Failed to schedule native alarm", e);
    }
  }

  private async cancelNativeAlarm(id: number) {
    try {
        await invoke('plugin:alarm-manager|cancel', {
            payload: { id }
        });
    } catch (e) {
        console.error("Failed to cancel native alarm", e);
    }
  }
}

export const alarmManagerService = new AlarmManagerService();
