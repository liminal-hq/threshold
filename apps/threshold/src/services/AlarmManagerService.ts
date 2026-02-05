import { APP_NAME } from '../constants';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { PlatformUtils } from '../utils/PlatformUtils';
import { sendNotification, registerActionTypes, onAction } from '@tauri-apps/plugin-notification';
import { Alarm } from '@threshold/core/types';
import { AlarmInput, AlarmRecord, AlarmMode } from '../types/alarm';
import { AlarmService } from './AlarmService';

// Define the plugin invoke types manually since we can't import from the plugin in this environment
interface ImportedAlarm {
	id: number;
	hour: number;
	minute: number;
	label: string;
}

export class AlarmManagerService {
	private initPromise: Promise<void> | null = null;
	private router: any = null;
	private scheduledIds = new Set<number>();

	public setRouter(router: any) {
		this.router = router;
	}

	public isInitialized(): boolean {
		return this.initPromise !== null;
	}

	async init() {
		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			try {
				console.log('[AlarmManager] Starting service initialization...');

				console.log('[AlarmManager] Setting up event listener 1/3: alarm-ring...');
				// Listen for alarms ringing from the Rust Backend (Desktop) and Android Plugin
				await listen<{ id: number }>('alarm-ring', (event) => {
					console.log(`========== FRONTEND EVENT RECEIVED: alarm-ring ==========`);
					console.log(`[AlarmManager] Received alarm-ring event for ID: ${event.payload.id}`);
					this.handleAlarmRing(event.payload.id);
				});
				console.log('[AlarmManager] Event listener 1/3 registered.');

				// Listen for alarms ringing from the Android Plugin (emitted via trigger())
				try {
					await listen<{ id: number }>('plugin:alarm-manager|alarm-ring', (event) => {
						console.log(
							`[AlarmManager] Received plugin alarm-ring event for ID: ${event.payload.id}`,
						);
						this.handleAlarmRing(event.payload.id);
					});
					console.log('[AlarmManager] Event listener 2/3 registered.');
				} catch (e) {
					console.warn(
						'[AlarmManager] Failed to register plugin event listener (may not be available on this platform):',
						e,
					);
				}

				console.log('[AlarmManager] Setting up event listener 3/3: alarms:batch:updated...');
				// Listen for batch events and refresh native schedule
				await listen('alarms:batch:updated', async () => {
					console.log('[AlarmManager] Received alarms:batch:updated event');
					const alarms = await AlarmService.getAll();
					this.syncNativeAlarms(alarms);
				});
				console.log('[AlarmManager] Event listener 3/3 registered.');

				console.log('[AlarmManager] Checking for native imports...');
				await this.checkImports();
				console.log('[AlarmManager] Native imports check complete.');

				console.log('[AlarmManager] Rescheduling all alarms...');
				// Initial sync
				const alarms = await AlarmService.getAll();
				await this.syncNativeAlarms(alarms);
				console.log('[AlarmManager] Reschedule complete.');

				console.log('[AlarmManager] Service initialization complete.');

				// Check if app was launched by an alarm notification (do this AFTER init completes)
				console.log('[AlarmManager] Checking for active alarm...');
				await this.checkActiveAlarm();

				// Register Notification Actions (Mobile Only)
				if (PlatformUtils.isMobile()) {
					console.log('[AlarmManager] Registering notification actions...');
					try {
						await registerActionTypes([
							{
								id: 'test_trigger',
								actions: [
									{
										id: 'test_action_1',
										title: 'Test Action 1',
									},
									{
										id: 'test_action_2',
										title: 'Test Action 2',
									},
								],
							},
							{
								id: 'alarm_trigger',
								actions: [
									{
										id: 'snooze',
										title: 'Snooze',
										input: false,
									},
									{
										id: 'dismiss',
										title: 'Dismiss',
										destructive: true,
										foreground: false, // Don't bring app to foreground for dismiss
									},
								],
							},
						]);

						await onAction((notification) => {
							console.log('[AlarmManager] Action performed:', notification);

							const actionTypeId = (notification as any).actionTypeId;
							if (actionTypeId !== 'alarm_trigger') {
								console.log(
									'[AlarmManager] Ignoring action from different category:',
									actionTypeId,
								);
								return;
							}

							const actionId = (notification as any).actionId;

							if (actionId === 'dismiss') {
								console.log('[AlarmManager] Action: Dismiss');
								this.stopRinging();
							} else if (actionId === 'snooze') {
								console.log('[AlarmManager] Action: Snooze');
								// Placeholder: Treat snooze as cancel for now until full snooze logic is reviewed
								this.stopRinging();
							}
						});
						console.log('[AlarmManager] Notification actions registered.');
					} catch (e) {
						console.error('[AlarmManager] Failed to register notification actions:', e);
					}
				}
			} catch (e) {
				console.error('[AlarmManager] CRITICAL: Initialization failed', e);
				console.error('[AlarmManager] Error details:', {
					message: e instanceof Error ? e.message : String(e),
					stack: e instanceof Error ? e.stack : undefined,
					raw: e,
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

			const result = await invoke<{ isAlarm: boolean; alarmId: number | null }>(
				'plugin:alarm-manager|check_active_alarm',
			).catch(() => null); // Mobile fetch might fail on desktop, ignore

			if (result && result.isAlarm && result.alarmId) {
				console.log(`[AlarmManager] Active alarm detected: ${result.alarmId}. Redirecting...`);

				if (this.router) {
					this.router.navigate({ to: '/ringing/$id', params: { id: result.alarmId.toString() } });
				} else {
					console.error('[AlarmManager] Router not initialized, cannot navigate to ringing screen');
				}
			}
		} catch (e) {
			console.error('Failed to check active alarm', e);
		}
	}

	/**
	 * Sync native alarms with the current state from Rust
	 */
	private async syncNativeAlarms(alarms: AlarmRecord[]) {
		const currentIds = new Set<number>();

		for (const alarm of alarms) {
			currentIds.add(alarm.id);

			// If enabled and has future trigger, schedule it
			if (alarm.enabled && alarm.nextTrigger && alarm.nextTrigger > Date.now()) {
				await this.scheduleNativeAlarm(alarm.id, alarm.nextTrigger, alarm.soundUri);
				this.scheduledIds.add(alarm.id);
			} else {
				// If disabled or expired, ensure it's not scheduled
				// (Optimisation: only cancel if we think it's scheduled)
				if (this.scheduledIds.has(alarm.id)) {
					await this.cancelNativeAlarm(alarm.id);
					this.scheduledIds.delete(alarm.id);
				}
			}
		}

		// Identify deleted alarms (present in scheduledIds but not in current alarms)
		const toCancel = [...this.scheduledIds].filter((id) => !currentIds.has(id));
		for (const id of toCancel) {
			console.log(`[AlarmManager] Alarm ${id} removed, cancelling native schedule.`);
			await this.cancelNativeAlarm(id);
			this.scheduledIds.delete(id);
		}
	}

	// Check for alarms created natively (e.g. via "Set Alarm" intent)
	private async checkImports() {
		try {
			const res = await invoke<{ imports: ImportedAlarm[] }>(
				'plugin:alarm-manager|get_launch_args',
			);
			const imports = res?.imports || [];
			if (imports.length > 0) {
				console.log(`[AlarmManager] Found ${imports.length} native alarms to import:`, imports);
				for (const imp of imports) {
					// Deduplication Check
					const allAlarms = await AlarmService.getAll();
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

					const newAlarm: AlarmInput = {
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

	async sendTestNotification() {
		console.log('[AlarmManager] Sending test notification...');
		const isMobile = PlatformUtils.isMobile();
		try {
			await sendNotification({
				title: 'Test Notification',
				body: 'This is a test notification with actions',
				actionTypeId: isMobile ? 'test_trigger' : undefined,
			});
			console.log('[AlarmManager] Test notification sent');
		} catch (e) {
			console.error('[AlarmManager] Failed to send test notification', e);
		}
	}

	async toggleAlarm(alarm: Alarm, enabled: boolean) {
		// Use AlarmService
		await AlarmService.toggle(alarm.id, enabled);
		// Sync handled by listener
	}

	async saveAndSchedule(alarm: AlarmInput) {
		const saved = await AlarmService.save(alarm);
		// Sync handled by listener
		return saved.id;
	}

	async deleteAlarm(id: number) {
		await AlarmService.delete(id);
		// Sync handled by listener
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
		const isMobile = PlatformUtils.isMobile();
		sendNotification({
			title: APP_NAME,
			body: 'Your alarm is ringing!',
			actionTypeId: isMobile ? 'alarm_trigger' : undefined,
		});

		// 2. Emit lifecycle event (fired)
		try {
			await AlarmService.reportFired(id, Date.now());
		} catch (e) {
			console.error('[AlarmManager] Failed to report alarm fired', e);
		}

		// 3. Open Floating Window (Singleton)
		try {
			const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
			const isMobile = PlatformUtils.isMobile();

			if (isMobile) {
				console.log('[AlarmManager] Mobile detected. Navigating current window to ringing screen.');
				if (this.router) {
					this.router.navigate({ to: '/ringing/$id', params: { id: id.toString() } });
				} else {
					console.error('[AlarmManager] Router not initialized, cannot navigate to ringing screen');
				}
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

		// 4. Wait for user action to dismiss/snooze.
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
