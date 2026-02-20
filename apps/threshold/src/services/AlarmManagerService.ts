// Coordinates alarm lifecycle, native scheduling sync, and ringing UI orchestration
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { APP_NAME } from '../constants';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { PlatformUtils } from '../utils/PlatformUtils';
import { sendNotification } from '@tauri-apps/plugin-notification';
import { Alarm } from '@threshold/core/types';
import { AlarmInput, AlarmRecord, AlarmMode } from '../types/alarm';
import { AlarmService } from './AlarmService';
import { SettingsService } from './SettingsService';
import { TimeFormatHelper } from '../utils/TimeFormatHelper';
import {
	alarmNotificationService,
	type NotificationActionType,
	type NotificationUpcomingResyncEvent,
} from './AlarmNotificationService';
import { notificationToastService } from './NotificationToastService';

// Define the plugin invoke types manually since we can't import from the plugin in this environment
interface ImportedAlarm {
	id: number;
	hour: number;
	minute: number;
	label: string;
}

type NotificationUpcomingResyncPayload = NotificationUpcomingResyncEvent | null | undefined;

export class AlarmManagerService {
	private initPromise: Promise<void> | null = null;
	private router: any = null;
	private scheduledTriggers = new Map<number, number>();

	public setRouter(router: any) {
		this.router = router;
	}

	public isInitialized(): boolean {
		return this.initPromise !== null;
	}

	private registerNotificationActionTypes() {
		alarmNotificationService.registerActionTypeProvider(
			'alarm-trigger-actions',
			(): NotificationActionType[] => {
				const snoozeLength = SettingsService.getSnoozeLength();
				const snoozeActionTitle = `Snooze (${snoozeLength}m)`;
				return [
					{
						id: 'alarm_trigger',
						actions: [
							{
								id: 'snooze',
								title: snoozeActionTitle,
								input: false,
							},
							{
								id: 'dismiss',
								title: 'Dismiss',
								destructive: true,
								foreground: false,
							},
						],
					},
				];
			},
		);

		alarmNotificationService.registerActionTypeProvider(
			'upcoming-alarm-actions',
			(): NotificationActionType[] => {
				const snoozeLength = SettingsService.getSnoozeLength();
				const snoozeActionTitle = `Snooze (${snoozeLength}m)`;
				return [
					{
						id: 'upcoming_alarm',
						actions: [
							{
								id: 'dismiss_alarm',
								title: 'Dismiss alarm',
								foreground: false,
							},
							{
								id: 'snooze_alarm',
								title: snoozeActionTitle,
								foreground: false,
							},
						],
					},
				];
			},
		);
	}

	async init() {
		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			try {
				console.log('[AlarmManager] Starting service initialisation...');

				await notificationToastService.init();

				console.log('[AlarmManager] Setting up event listener 1/4: alarm-ring...');
				// Listen for alarms ringing from the Rust Backend (Desktop)
				await listen<{ id: number }>('alarm-ring', (event) => {
					console.log(`[AlarmManager] Received alarm-ring event for ID: ${event.payload.id}`);
					this.handleAlarmRing(event.payload.id);
				});
				console.log('[AlarmManager] Event listener 1/4 registered.');

				console.log('[AlarmManager] Setting up event listener 2/4: alarms:batch:updated...');
				// Listen for batch events and refresh native schedule
				await listen('alarms:batch:updated', async () => {
					console.log('[AlarmManager] Received alarms:batch:updated event');
					const alarms = await AlarmService.getAll();
					await this.syncNativeAlarms(alarms);
					await alarmNotificationService.requestUpcomingResync({
						reason: 'alarm-batch-updated',
					});
				});
				console.log('[AlarmManager] Event listener 2/4 registered.');

				console.log('[AlarmManager] Setting up event listener 3/4: settings-changed...');
				await listen<{ key?: string; value?: unknown }>('settings-changed', async (event) => {
					if (event.payload?.key !== 'is24h') return;
					if (!PlatformUtils.isMobile()) return;

					console.log('[AlarmManager] Received settings-changed event for is24h');
					await this.resyncUpcomingNotifications({
						reason: 'settings-24h-changed',
					});
				});
				console.log('[AlarmManager] Event listener 3/4 registered.');

				console.log('[AlarmManager] Setting up event listener 4/4: notifications:upcoming:resync...');
				await listen<NotificationUpcomingResyncEvent>(
					'notifications:upcoming:resync',
					async (event) => {
						await this.resyncUpcomingNotifications(event.payload);
					},
				);
				console.log('[AlarmManager] Event listener 4/4 registered.');

				console.log('[AlarmManager] Checking for native imports...');
				await this.checkImports();
				console.log('[AlarmManager] Native imports check complete.');

				console.log('[AlarmManager] Rescheduling all alarms...');
				// Initial sync
				const alarms = await AlarmService.getAll();
				await this.syncNativeAlarms(alarms);
				await alarmNotificationService.requestUpcomingResync({ reason: 'manual' });
				console.log('[AlarmManager] Reschedule complete.');

				console.log('[AlarmManager] Service initialisation complete.');

				// Check if app was launched by an alarm notification (do this AFTER init completes)
				console.log('[AlarmManager] Checking for active alarm...');
				await this.checkActiveAlarm();

				// Register Notification Actions (Mobile Only)
				if (PlatformUtils.isMobile()) {
					console.log('[AlarmManager] Registering notification actions...');
					try {
						this.registerNotificationActionTypes();
						await alarmNotificationService.initialiseMobileNotificationActions({
							onDismissRinging: async () => {
								console.log('[AlarmManager] Action: Dismiss');
								await this.stopRinging();
							},
							onSnoozeRinging: async () => {
								console.log('[AlarmManager] Action: Snooze');
								// Keep existing behaviour until ringing notifications include alarm IDs.
								await this.stopRinging();
							},
							onDismissUpcoming: async (alarmId) => {
								console.log('[AlarmManager] Action: Dismiss upcoming alarm', alarmId);
								await this.dismissNextOccurrence(alarmId);
							},
							onSnoozeUpcoming: async (alarmId, snoozeLength) => {
								console.log('[AlarmManager] Action: Snooze upcoming alarm', alarmId);
								await this.snoozeAlarm(alarmId, snoozeLength, false);
								await this.emitUpcomingSnoozeToast(alarmId, snoozeLength);
							},
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
			if (window.location.pathname.includes('/ringing')) return;

			const result = await invoke<{ isAlarm: boolean; alarmId: number | null }>(
				'plugin:alarm-manager|check_active_alarm',
			).catch(() => null);

			if (result && result.isAlarm && result.alarmId) {
				await alarmNotificationService.cancelUpcomingNotification(result.alarmId);
				console.log(`[AlarmManager] Active alarm detected: ${result.alarmId}. Redirecting...`);

				if (this.router) {
					this.router.navigate({ to: '/ringing/$id', params: { id: result.alarmId.toString() } });
				} else {
					console.error('[AlarmManager] Router not initialised, cannot navigate to ringing screen');
				}
			}
		} catch (e) {
			console.error('Failed to check active alarm', e);
		}
	}

	private async dismissNextOccurrence(alarmId: number): Promise<void> {
		await alarmNotificationService.cancelUpcomingNotification(alarmId);
		await AlarmService.dismiss(alarmId);
	}

	private async emitUpcomingSnoozeToast(alarmId: number, durationMinutes: number): Promise<void> {
		let message = `Alarm snoozed for ${durationMinutes} min`;
		try {
			const alarm = await AlarmService.get(alarmId);
			if (alarm?.nextTrigger) {
				const is24h = SettingsService.getIs24h();
				const formattedTime = TimeFormatHelper.format(alarm.nextTrigger, is24h);
				message = `${message} and will go off at ${formattedTime}`;
			}
		} catch (e) {
			console.warn('[AlarmManager] Failed to load snoozed alarm details for toast', e);
		}

		try {
			await alarmNotificationService.publishToast({
				kind: 'upcoming-snoozed',
				message,
				platform: 'android',
			});
		} catch (e) {
			console.warn('[AlarmManager] Failed to publish toast confirmation', e);
		}
	}

	/**
	 * Sync native alarms with the current state from Rust
	 */
	private async syncNativeAlarms(alarms: AlarmRecord[]) {
		const currentIds = new Set<number>();

		for (const alarm of alarms) {
			currentIds.add(alarm.id);

			if (alarm.enabled && alarm.nextTrigger && alarm.nextTrigger > Date.now()) {
				const previousTrigger = this.scheduledTriggers.get(alarm.id);
				if (previousTrigger !== alarm.nextTrigger) {
					await this.scheduleNativeAlarm(alarm.id, alarm.nextTrigger, alarm.soundUri);
					this.scheduledTriggers.set(alarm.id, alarm.nextTrigger);
				}
			} else {
				if (this.scheduledTriggers.has(alarm.id)) {
					await this.cancelNativeAlarm(alarm.id);
					this.scheduledTriggers.delete(alarm.id);
				}
			}
		}

		const toCancel = [...this.scheduledTriggers.keys()].filter((id) => !currentIds.has(id));
		for (const id of toCancel) {
			console.log(`[AlarmManager] Alarm ${id} removed, cancelling native schedule.`);
			await this.cancelNativeAlarm(id);
			this.scheduledTriggers.delete(id);
		}
	}

	private async resyncUpcomingNotifications(
		payload: NotificationUpcomingResyncPayload,
	): Promise<void> {
		if (!PlatformUtils.isMobile()) return;

		const alarms = await AlarmService.getAll();
		const alarmsById = new Map<number, AlarmRecord>(alarms.map((alarm) => [alarm.id, alarm]));
		const targetIds =
			payload?.alarmIds && payload.alarmIds.length > 0
				? [...new Set(payload.alarmIds)]
				: alarms.map((alarm) => alarm.id);

		for (const alarmId of targetIds) {
			const alarm = alarmsById.get(alarmId);
			if (!alarm || !alarm.enabled || !alarm.nextTrigger || alarm.nextTrigger <= Date.now()) {
				await alarmNotificationService.cancelUpcomingNotification(alarmId);
				continue;
			}

			await alarmNotificationService.scheduleUpcomingNotification(alarm, alarm.nextTrigger);
		}
	}

	// Check for alarms created natively (e.g. via "Set Alarm" intent)
	private async checkImports() {
		try {
			const imports =
				(await invoke<ImportedAlarm[]>('plugin:alarm-manager|get_launch_args')) ?? [];
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
						activeDays: [0, 1, 2, 3, 4, 5, 6],
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
		await AlarmService.toggle(alarm.id, enabled);
	}

	async saveAndSchedule(alarm: AlarmInput) {
		const saved = await AlarmService.save(alarm);
		return saved.id;
	}

	async deleteAlarm(id: number) {
		await AlarmService.delete(id);
		await alarmNotificationService.cancelUpcomingNotification(id);
	}

	async snoozeAlarm(id: number, minutes: number, stopCurrentRinging: boolean = true) {
		console.log(`[AlarmManager] Snoozing alarm ${id} for ${minutes} minutes`);
		await alarmNotificationService.cancelUpcomingNotification(id);
		await AlarmService.snooze(id, minutes);
		if (stopCurrentRinging) {
			await this.stopRinging();
		}
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
			await alarmNotificationService.cancelUpcomingNotification(id);

			const isMobile = PlatformUtils.isMobile();
			try {
				await sendNotification({
					title: APP_NAME,
					body: 'Your alarm is ringing!',
					actionTypeId: isMobile ? 'alarm_trigger' : undefined,
				});
			} catch (e) {
				console.error('[AlarmManager] Failed to send ringing notification', e);
			}

		try {
			await AlarmService.reportFired(id, Date.now());
		} catch (e) {
			console.error('[AlarmManager] Failed to report alarm fired', e);
		}

		try {
			const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
			const mobile = PlatformUtils.isMobile();

			if (mobile) {
				console.log('[AlarmManager] Mobile detected. Navigating current window to ringing screen.');
				if (this.router) {
					this.router.navigate({ to: '/ringing/$id', params: { id: id.toString() } });
				} else {
					console.error('[AlarmManager] Router not initialised, cannot navigate to ringing screen');
				}
				return;
			}

			const label = 'ringing-window';
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
