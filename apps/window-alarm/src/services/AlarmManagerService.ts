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

export class AlarmManagerService {

  async init() {
    await databaseService.init();
  }

  async loadAlarms(): Promise<Alarm[]> {
    return await databaseService.getAllAlarms();
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
