import { databaseService } from './DatabaseService';
import { invoke } from '@tauri-apps/api/core';
import {
	sendNotification,
} from '@tauri-apps/plugin-notification';
import { platform } from '@tauri-apps/plugin-os';
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
				console.log('Importing native alarms:', imports);
				for (const imp of imports) {
					// Deduplication Check:
					// We check if an alarm with this native ID already exists in our DB.
					// NOTE: This assumes we persist the native ID.
					// Currently, our SQLite schema uses auto-increment ID.
					// To support true dedupe, we should probably add `native_id` to schema or check approximate match.

					// For this iteration, we'll check if an alarm with the exact same Time and Label exists.
					const allAlarms = await databaseService.getAllAlarms();
					const timeStr = `${imp.hour.toString().padStart(2, '0')}:${imp.minute.toString().padStart(2, '0')}`;

					const duplicate = allAlarms.find(
						(a) => a.mode === AlarmMode.Fixed && a.fixedTime === timeStr && a.label === imp.label,
					);

					if (duplicate) {
						console.log('Skipping duplicate import:', imp);
						continue;
					}

					// Use the native ID for the new DB record to keep them in sync if possible,
					// or just to have a reference.
					// However, saveAndSchedule will re-schedule the native alarm.
					// To avoid double scheduling (one from Intent, one from here),
					// we should cancel the native one first OR just update our DB.
					// Since our scheduler logic might differ slightly (e.g. active days),
					// it is safer to let our app "take over" the alarm management.

					// 1. Cancel the 'temporary' native alarm created by the Intent
					// (It will be immediately replaced by saveAndSchedule)
					await this.cancelNativeAlarm(imp.id);

					const newAlarm: Omit<Alarm, 'id'> & { id?: number } = {
						// We don't force imp.id as the DB ID because of autoincrement,
						// but we could store it if we had a column. For now, a new ID is fine.
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
		}
	}

	private async rescheduleAlarm(alarm: Alarm) {
		return this.saveAndSchedule(alarm);
	}

	async saveAndSchedule(alarm: Omit<Alarm, 'id'> & { id?: number }) {
		// 1. Calculate next trigger
		// Map UI Alarm type to Core Alarm type if needed, or ensure they match
		// Cast activeDays to DayOfWeek[]
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
	}

	async deleteAlarm(id: number) {
		await this.cancelNativeAlarm(id);
		await databaseService.deleteAlarm(id);
	}

	private async scheduleNativeAlarm(id: number, timestamp: number) {
		console.log(`Scheduling alarm ${id} for ${new Date(timestamp).toLocaleString()}`);
		try {
			await invoke('plugin:alarm-manager|schedule', {
				payload: { id, triggerAt: timestamp },
			});
		} catch (e) {
			console.error('Failed to schedule native alarm', e);
		}

        // Desktop Notification Logic (Runs independently of native plugin success)
        // We use the OS plugin to check if we are on a desktop platform.
        // Android/iOS handle notifications natively via the alarm-manager plugin.
        await this.sendNotificationHelper(id, timestamp);
	}

	private async sendNotificationHelper(id: number, timestamp: number) {
		try {
			const currentPlatform = platform();
			if (currentPlatform === 'android' || currentPlatform === 'ios') {
				return;
			}

			// Calculate delay until the alarm
			const delay = timestamp - Date.now();
			if (delay > 0) {
				console.log(`Setting desktop timer for ${delay}ms`);
				setTimeout(async () => {
					// 1. Send Notification
					sendNotification({
						title: 'Window Alarm',
						body: 'Your alarm is ringing!',
					});

					// 2. Open Floating Window
					try {
						// Dynamically import to avoid issues on mobile if pure JS bundle
						const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
						const label = `alarm-ring-${timestamp}`;
						
						// Check if window exists? (Tauri throws if duplicate label, so use unique)
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

				}, delay);
			}
		} catch (err) {
			console.warn('Notification helper failed:', err);
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
