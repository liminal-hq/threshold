import { databaseService } from './DatabaseService';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { PlatformUtils } from '../utils/PlatformUtils';
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
	private initialized = false;

	async init() {
		if (this.initialized) return;
		this.initialized = true;

		await databaseService.init();
		
		// Listen for alarms ringing from the Rust Backend (Desktop)
		await listen<number>('alarm-ring', (event) => {
			console.log(`[AlarmManager] Received alarm-ring event for ID: ${event.payload}`);
			this.handleAlarmRing(event.payload);
		});

		// Listen for alarms ringing from the Android Plugin (emitted via trigger())
		await listen<{ id: number }>('plugin:alarm-manager|alarm-ring', (event) => {
			console.log(`[AlarmManager] Received plugin alarm-ring event for ID: ${event.payload.id}`);
			this.handleAlarmRing(event.payload.id);
		});

		// Listen for global alarm changes (from other windows)
		await listen('global-alarms-changed', () => {
			console.log('[AlarmManager] Received global-alarms-changed event');
			this.notifyListeners();
		});

		await this.checkImports();
		
		// Check if launched from alarm
		await this.checkActiveAlarm();

		await this.rescheduleAll();
	}

	private async checkActiveAlarm() {
		try {
			if (window.location.pathname.includes('/ringing')) return; // Already there

			const result = await invoke<{ isAlarm: boolean; alarmId: number | null }>('plugin:alarm-manager|check_active_alarm')
				.catch(() => null); // Mobile fetch might fail on desktop, ignore

			if (result && result.isAlarm && result.alarmId) {
				console.log(`[AlarmManager] Active alarm detected: ${result.alarmId}. Redirecting...`);
				
				// Import router dynamically or use window.location if router not ready (but here it should be)
				// We can't import router here easily because of circular dep risk if Service is imported in Router
				// BUT we can use window.dispatchEvent to tell App to navigate, or just use window.location hash if hash router
				// Since we use TanStack router, let's emit an event that App.tsx or a global listener handles,
				// OR just use a simple CustomEvent that the View listens to.
				
				// Actually, simpler: redirect using the 'alarm-ring' event logic which opens the window on Desktop
				// On Mobile, we just want to Navigate.
				
				const { router } = await import('../router');
				router.navigate({ to: '/ringing/$id', params: { id: result.alarmId.toString() } }); // Use correct param name 'id' from router definition
			}
		} catch (e) {
			console.error('Failed to check active alarm', e);
		}
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
            this.notifyGlobalListeners();
		}
	}

	private async rescheduleAlarm(alarm: Alarm) {
		return this.saveAndSchedule(alarm);
	}

	// Helper to emit change event locally
	private notifyListeners() {
		document.dispatchEvent(new CustomEvent('alarms-changed'));
	}

	// Helper to emit change event globally (cross-window)
	private async notifyGlobalListeners() {
		try {
			await emit('global-alarms-changed');
			// Also notify locally for the window that initiated the change
			this.notifyListeners();
		} catch (e) {
			console.error('Failed to emit global-alarms-changed', e);
			// Fallback to local
			this.notifyListeners();
		}
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
			await this.scheduleNativeAlarm(id, nextTrigger, alarm.soundUri);
		} else {
			await this.cancelNativeAlarm(id);
		}
		
		this.notifyGlobalListeners();
		return id;
	}

	async deleteAlarm(id: number) {
		await this.cancelNativeAlarm(id);
		await databaseService.deleteAlarm(id);
		this.notifyGlobalListeners();
	}

	private async scheduleNativeAlarm(id: number, timestamp: number, soundUri?: string | null) {
		console.log(`Scheduling alarm ${id} for ${new Date(timestamp).toLocaleString()}`);
		try {
			await invoke('plugin:alarm-manager|schedule', {
				payload: { id, triggerAt: timestamp, soundUri },
			});
		} catch (e: any) {
			console.error('Failed to schedule native alarm', e.message || e.toString());
		}
	}

    private async handleAlarmRing(id: number) {
        // 1. Send Notification
        sendNotification({
            title: 'Window Alarm',
            body: 'Your alarm is ringing!',
        });

        // 2. Open Floating Window (Singleton)
        try {
            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            const isMobile = PlatformUtils.isMobile();

            if (isMobile) {
                console.log('[AlarmManager] Mobile detected. Navigating current window to ringing screen.');
                const { router } = await import('../router');
                router.navigate({ to: '/ringing/$id', params: { id: id.toString() } });
                return;
            }

            const label = 'ringing-window'; // Fixed label to ensure singleton
            
            const existing = await WebviewWindow.getByLabel(label);

            if (existing) {
                console.log('Ringing window already exists. Updating content and focusing...');
                await emit('alarm-update', { id });
                await existing.setFocus();
                return;
            }

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
