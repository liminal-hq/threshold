import { databaseService } from './DatabaseService';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
	sendNotification,
} from '@tauri-apps/plugin-notification';
import { Alarm, AlarmMode, DayOfWeek } from '@window-alarm/core/types';
import { calculateNextTrigger as calcTrigger } from '@window-alarm/core/scheduler';

// Define the plugin invoke types manually since we can't import from the plugin in this environment
interface ImportedAlarm {
	id: number;
	hour: number;
	minute: number;
	label: string;
}

export class AlarmManagerService {
	async init() {
		await databaseService.init();
		
        // Listen for alarms ringing from the Rust Backend
        await listen<number>('alarm-ring', (event) => {
            console.log(`[AlarmManager] Received alarm-ring event for ID: ${event.payload}`);
            this.handleAlarmRing(event.payload);
        });

        await this.checkImports();
        await this.rescheduleAll();
	}

    // Re-hydrate all alarms on startup (send to Rust scheduler)
    async rescheduleAll() {
        console.log('[AlarmManager] Rescheduling all alarms...');
        const alarms = await databaseService.getAllAlarms();
        for (const alarm of alarms) {
            if (alarm.enabled && alarm.nextTrigger) {
                // If trigger is in the future, schedule it
                if (alarm.nextTrigger > Date.now()) {
                    await this.scheduleNativeAlarm(alarm.id, alarm.nextTrigger);
                } else {
                    // Missed alarm? For now, maybe just calc next trigger
                    console.log(`[AlarmManager] Alarm ${alarm.id} missed trigger at ${new Date(alarm.nextTrigger).toLocaleString()}. Rescheduling next.`);
                     this.saveAndSchedule(alarm);
                }
            }
        }
    }

	async loadAlarms(): Promise<Alarm[]> {
		return await databaseService.getAllAlarms();
	}

	// Check for alarms created natively (e.g. via "Set Alarm" intent)
	private async checkImports() {
		try {
			const imports = await invoke<ImportedAlarm[]>('plugin:alarm-manager|get_launch_args');
			if (imports && imports.length > 0) {
				console.log('Importing native alarms:', imports);
				for (const imp of imports) {
					// Deduplication Check
					const allAlarms = await databaseService.getAllAlarms();
					const timeStr = `${imp.hour.toString().padStart(2, '0')}:${imp.minute.toString().padStart(2, '0')}`;

					const duplicate = allAlarms.find(
						(a) => a.mode === AlarmMode.Fixed && a.fixedTime === timeStr && a.label === imp.label,
					);

					if (duplicate) {
						console.log('Skipping duplicate import:', imp);
						continue;
					}

					// Cancel the 'temporary' native alarm created by the Intent
					await this.cancelNativeAlarm(imp.id);

					const newAlarm: Omit<Alarm, 'id'> & { id?: number } = {
						label: imp.label,
						mode: AlarmMode.Fixed,
						fixedTime: timeStr,
						activeDays: [0, 1, 2, 3, 4, 5, 6], // Default to every day
						enabled: true,
					};

					await this.saveAndSchedule(newAlarm);
				}
			}
		} catch (e) {
			console.error('Failed to check imports', e);
		}
	}

	async toggleAlarm(alarm: Alarm, enabled: boolean) {
		const updatedAlarm = { ...alarm, enabled };
		if (enabled) {
			this.rescheduleAlarm(updatedAlarm);
		} else {
			await this.cancelNativeAlarm(alarm.id);
			await databaseService.saveAlarm({ ...updatedAlarm, nextTrigger: undefined });
            this.notifyListeners();
		}
	}

	private async rescheduleAlarm(alarm: Alarm) {
		return this.saveAndSchedule(alarm);
	}

    // Helper to emit change event
	private notifyListeners() {
		document.dispatchEvent(new CustomEvent('alarms-changed'));
	}

	async saveAndSchedule(alarm: Omit<Alarm, 'id'> & { id?: number }) {
		// 1. Calculate next trigger
		console.log(`[AlarmManager] Configuring alarm: Label="${alarm.label}", Enabled=${alarm.enabled}, Days=[${alarm.activeDays}]`);
		
		const coreAlarm = {
			...alarm,
			id: alarm.id || 0, // Temp ID for calc
			activeDays: alarm.activeDays as DayOfWeek[],
		};

		const nextTrigger = calcTrigger(coreAlarm);
		if (nextTrigger) {
			console.log(`[AlarmManager] Next trigger calculated: ${new Date(nextTrigger).toLocaleString()} (${nextTrigger})`);
		} else {
			console.log('[AlarmManager] No next trigger calculated (disabled or no active days?)');
		}

		// 2. Save to DB
		const id = await databaseService.saveAlarm({
			...alarm,
			nextTrigger: nextTrigger ?? undefined,
		});

		// 3. Schedule Native
		if (alarm.enabled && nextTrigger) {
			await this.scheduleNativeAlarm(id, nextTrigger);
		} else {
			await this.cancelNativeAlarm(id);
		}
		
		this.notifyListeners();
		return id;
	}

	async deleteAlarm(id: number) {
		await this.cancelNativeAlarm(id);
		await databaseService.deleteAlarm(id);
		this.notifyListeners();
	}

	private async scheduleNativeAlarm(id: number, timestamp: number) {
		console.log(`Scheduling alarm ${id} for ${new Date(timestamp).toLocaleString()}`);
		try {
			await invoke('plugin:alarm-manager|schedule', {
				payload: { id, triggerAt: timestamp },
			});
		} catch (e) {
			console.error('Failed to schedule native alarm', JSON.stringify(e));
		}
	}

    private async handleAlarmRing(id: number) {
        // 1. Send Notification
        sendNotification({
            title: 'Window Alarm',
            body: 'Your alarm is ringing!',
        });

        // 2. Open Floating Window
        try {
            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            const timestamp = Date.now();
            const label = `alarm-ring-${timestamp}`;
            
            const webview = new WebviewWindow(label, {
                url: `/ringing/${id}`, 
                title: 'Alarm',
                width: 400,
                height: 500,
                resizable: false,
                alwaysOnTop: true,
                center: true,
                skipTaskbar: false,
                decorations: false,
                transparent: true,
                focus: true,
            });

            webview.once('tauri://created', function () {
                console.log('Alarm window created');
            });
            
            webview.once('tauri://error', function (e) {
                console.error('Alarm window creation error', e);
            });

        } catch (err) {
            console.error('Failed to open alarm window', err);
        }

        // 3. Auto-Reschedule (Calculate next trigger)
        console.log(`[AlarmManager] Alarm ${id} fired. Rescheduling next occurrence...`);
        const alarms = await databaseService.getAllAlarms();
        const alarm = alarms.find(a => a.id === id);
        if (alarm) {
            await this.saveAndSchedule(alarm);
        }
    }

	private async cancelNativeAlarm(id: number) {
		try {
			await invoke('plugin:alarm-manager|cancel', {
				payload: { id },
			});
		} catch (e) {
			console.error('Failed to cancel native alarm', e);
		}
	}
}

export const alarmManagerService = new AlarmManagerService();
