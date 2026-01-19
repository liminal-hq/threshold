import { databaseService } from './DatabaseService';
import { APP_NAME } from '../constants';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { PlatformUtils } from '../utils/PlatformUtils';
import {
	sendNotification,
} from '@tauri-apps/plugin-notification';
import { Alarm, AlarmMode, DayOfWeek } from '@threshold/core/types';
import { calculateNextTrigger as calcTrigger } from '@threshold/core/scheduler';

// Define the plugin invoke types manually since we can't import from the plugin in this environment
interface ImportedAlarm {
	id: number;
	hour: number;
	minute: number;
	label: string;
}

export class AlarmManagerService {
	private initPromise: Promise<void> | null = null;

	async init() {
		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			try {
				console.log('[AlarmManager] Starting service initialization...');
				await databaseService.init();
				console.log('[AlarmManager] Database service ready.');
				
				console.log('[AlarmManager] Setting up event listener 1/3: alarm-ring...');
				// Listen for alarms ringing from the Rust Backend (Desktop) and Android Plugin
				await listen<{ id: number }>('alarm-ring', (event) => {
					console.log(`========== FRONTEND EVENT RECEIVED: alarm-ring ==========`);
					console.log(`[AlarmManager] Received alarm-ring event for ID: ${event.payload.id}`);
					console.log(`[AlarmManager] Event details:`, event);
					this.handleAlarmRing(event.payload.id);
					console.log(`========== FRONTEND EVENT HANDLER CALLED ==========`);
				});
				console.log('[AlarmManager] Event listener 1/3 registered.');

				// Listen for alarms ringing from the Android Plugin (emitted via trigger())
				try {
					await listen<{ id: number }>('plugin:alarm-manager|alarm-ring', (event) => {
						console.log(`[AlarmManager] Received plugin alarm-ring event for ID: ${event.payload.id}`);
						this.handleAlarmRing(event.payload.id);
					});
					console.log('[AlarmManager] Event listener 2/3 registered.');
				} catch (e) {
					console.warn('[AlarmManager] Failed to register plugin event listener (may not be available on this platform):', e);
				}

				console.log('[AlarmManager] Setting up event listener 3/3: global-alarms-changed...');
				// Listen for global alarm changes (from other windows)
				await listen('global-alarms-changed', () => {
					console.log('[AlarmManager] Received global-alarms-changed event');
					this.notifyListeners();
				});
				console.log('[AlarmManager] Event listener 3/3 registered.');

				console.log('[AlarmManager] Checking for native imports...');
				await this.checkImports();
				console.log('[AlarmManager] Native imports check complete.');
				
				console.log('[AlarmManager] Rescheduling all alarms...');
				await this.rescheduleAll();
				console.log('[AlarmManager] Reschedule complete.');



				console.log('[AlarmManager] Service initialization complete.');
				
				// Check if app was launched by an alarm notification (do this AFTER init completes)
				console.log('[AlarmManager] Checking for active alarm...');
				await this.checkActiveAlarm();
			} catch (e) {
				console.error('[AlarmManager] CRITICAL: Initialization failed', e);
				console.error('[AlarmManager] Error details:', {
					message: e instanceof Error ? e.message : String(e),
					stack: e instanceof Error ? e.stack : undefined,
					raw: e
				});
				throw e;
			}
		})();

		return this.initPromise;
	}

	// Check if the app was launched by an alarm notification
	// This is called AFTER init() completes to avoid interrupting alarm loading
	private async checkActiveAlarm() {
		try {
			if (window.location.pathname.includes('/ringing')) return; // Already there

			const result = await invoke<{ isAlarm: boolean; alarmId: number | null }>('plugin:alarm-manager|check_active_alarm')
				.catch(() => null); // Mobile fetch might fail on desktop, ignore

			if (result && result.isAlarm && result.alarmId) {
				console.log(`[AlarmManager] Active alarm detected: ${result.alarmId}. Redirecting...`);
				
				const { router } = await import('../router');
				router.navigate({ to: '/ringing/$id', params: { id: result.alarmId.toString() } });
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
			const res = await invoke<{ imports: ImportedAlarm[] }>('plugin:alarm-manager|get_launch_args');
			const imports = res?.imports || [];
			if (imports.length > 0) {
				console.log(`[AlarmManager] Found ${imports.length} native alarms to import:`, imports);
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
        console.log(`[DELETE_DEBUG] AlarmManagerService.deleteAlarm(${id}) called`);
		await this.cancelNativeAlarm(id);
        console.log(`[DELETE_DEBUG] cancelled native alarm ${id}, now deleting from DB...`);
		await databaseService.deleteAlarm(id);
        console.log(`[DELETE_DEBUG] DB delete complete for ${id}, notifying listeners...`);
		this.notifyGlobalListeners();
        console.log(`[DELETE_DEBUG] listeners notified for ${id}`);
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
            title: APP_NAME,
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

	async stopRinging() {
		try {
			console.log('[AlarmManager] Stopping ringing...');
			await invoke('plugin:alarm-manager|stop_ringing');
		} catch (e) {
			console.error('Failed to stop ringing', e);
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
