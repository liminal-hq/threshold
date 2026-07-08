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
	private scheduledSignatures = new Map<number, string>();

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

				// Seed Rust's snooze-length state from the persisted setting. Rust only
				// otherwise learns this reactively when the user changes it in Settings,
				// so without this, a native (Kotlin-to-Rust) snooze early in a session
				// would use the hardcoded default instead of the user's preference.
				SettingsService.syncSnoozeLengthToRust(SettingsService.getSnoozeLength());

				await notificationToastService.init();

				console.log('[AlarmManager] Setting up event listener 1/6: alarm-ring...');
				// Listen for alarms ringing from the Rust Backend (Desktop)
				await listen<{ id: number }>('alarm-ring', (event) => {
					console.log(`[AlarmManager] Received alarm-ring event for ID: ${event.payload.id}`);
					this.handleAlarmRing(event.payload.id);
				});
				console.log('[AlarmManager] Event listener 1/6 registered.');

				console.log('[AlarmManager] Setting up event listener 2/6: alarms:batch:updated...');
				// Listen for batch events and refresh native schedule
				await listen('alarms:batch:updated', async () => {
					console.log('[AlarmManager] Received alarms:batch:updated event');
					const alarms = await AlarmService.getAll();
					await this.syncNativeAlarms(alarms);
					await alarmNotificationService.requestUpcomingResync({
						reason: 'alarm-batch-updated',
					});
				});
				console.log('[AlarmManager] Event listener 2/6 registered.');

				console.log('[AlarmManager] Setting up event listener 3/6: alarm:cancelled...');
				// Eagerly cancel native alarm and upcoming notification when Rust emits alarm:cancelled.
				// This fires before alarms:batch:updated and closes the race window where a cancelled
				// alarm could still fire if the BroadcastReceiver was already dispatched.
				await listen<{ id: number; reason: string }>('alarm:cancelled', async (event) => {
					const { id } = event.payload;
					console.log(`[AlarmManager] Received alarm:cancelled for id=${id}, reason=${event.payload.reason}`);
					await this.cancelNativeAlarm(id);
					await alarmNotificationService.cancelUpcomingNotification(id);
					this.scheduledSignatures.delete(id);
				});
				console.log('[AlarmManager] Event listener 3/6 registered.');

				console.log('[AlarmManager] Setting up event listener 4/6: settings-changed...');
				await listen<{ key?: string; value?: unknown }>('settings-changed', async (event) => {
					if (event.payload?.key !== 'is24h') return;
					if (!PlatformUtils.isMobile()) return;

					console.log('[AlarmManager] Received settings-changed event for is24h');
					await this.resyncUpcomingNotifications({
						reason: 'settings-24h-changed',
					});
				});
				console.log('[AlarmManager] Event listener 4/6 registered.');

				console.log('[AlarmManager] Setting up event listener 5/6: notifications:upcoming:resync...');
				await listen<NotificationUpcomingResyncEvent>(
					'notifications:upcoming:resync',
					async (event) => {
						await this.resyncUpcomingNotifications(event.payload);
					},
				);
				console.log('[AlarmManager] Event listener 5/6 registered.');

				console.log('[AlarmManager] Setting up event listener 6/6: alarm:snoozed...');
				// Unified snooze confirmation toast — Rust emits alarm:snoozed for every
				// snooze regardless of source (native ringing notification, watch, upcoming
				// notification, in-app Ringing screen), so one listener here covers all of
				// them instead of each call site publishing its own toast.
				await listen<{ id: number; originalTrigger: number; snoozedUntil: number }>(
					'alarm:snoozed',
					async (event) => {
						await this.publishSnoozeToast(event.payload);
					},
				);
				console.log('[AlarmManager] Event listener 6/6 registered.');

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

				// Register Notification Actions (Mobile Only)
				if (PlatformUtils.isMobile()) {
					console.log('[AlarmManager] Registering notification actions...');
					try {
						this.registerNotificationActionTypes();
						await alarmNotificationService.initialiseMobileNotificationActions({
							onDismissRinging: async () => {
								// The native AlarmRingingService dismiss action is handled entirely
								// in Rust (apps/threshold/src-tauri/src/lib.rs); this only fires
								// from the older JS-driven 'alarm_trigger' notification action, which
								// has no alarm ID to re-arm against.
								console.log('[AlarmManager] Action: Dismiss');
								await this.stopRinging();
							},
							onSnoozeRinging: async () => {
								// Same story as onDismissRinging — the native snooze action is
								// handled entirely in Rust; this is the ID-less JS fallback only.
								console.log('[AlarmManager] Action: Snooze');
								await this.stopRinging();
							},
							onDismissUpcoming: async (alarmId) => {
								console.log('[AlarmManager] Action: Dismiss upcoming alarm', alarmId);
								await this.dismissNextOccurrence(alarmId);
							},
							onSnoozeUpcoming: async (alarmId, snoozeLength) => {
								console.log('[AlarmManager] Action: Snooze upcoming alarm', alarmId);
								await this.snoozeUpcoming(alarmId, snoozeLength);
								// Toast is published by the alarm:snoozed listener registered in init().
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

	private async dismissNextOccurrence(alarmId: number): Promise<void> {
		await alarmNotificationService.cancelUpcomingNotification(alarmId);
		await AlarmService.dismiss(alarmId);
	}

	private async publishSnoozeToast(payload: {
		id: number;
		originalTrigger: number;
		snoozedUntil: number;
	}): Promise<void> {
		const durationMinutes = Math.round((payload.snoozedUntil - payload.originalTrigger) / 60_000);
		const is24h = SettingsService.getIs24h();
		const formattedTime = TimeFormatHelper.format(payload.snoozedUntil, is24h);
		const message = `Alarm snoozed for ${durationMinutes} min and will go off at ${formattedTime}`;

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
				const nextSignature = this.getNativeScheduleSignature(alarm.nextTrigger, alarm.soundUri);
				const previousSignature = this.scheduledSignatures.get(alarm.id);
				if (previousSignature !== nextSignature) {
					const scheduled = await this.scheduleNativeAlarm(
						alarm.id,
						alarm.nextTrigger,
						alarm.soundUri,
					);
					if (scheduled) {
						this.scheduledSignatures.set(alarm.id, nextSignature);
					}
				}
			} else {
				if (this.scheduledSignatures.has(alarm.id)) {
					await this.cancelNativeAlarm(alarm.id);
					this.scheduledSignatures.delete(alarm.id);
				}
			}
		}

		const toCancel = [...this.scheduledSignatures.keys()].filter((id) => !currentIds.has(id));
		for (const id of toCancel) {
			console.log(`[AlarmManager] Alarm ${id} removed, cancelling native schedule.`);
			await this.cancelNativeAlarm(id);
			this.scheduledSignatures.delete(id);
		}
	}

	private getNativeScheduleSignature(timestamp: number, soundUri?: string | null): string {
		return `${timestamp}|${soundUri ?? ''}`;
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
		// Cancellation is handled by the alarm:cancelled listener registered in init().
		await AlarmService.delete(id);
	}

	async snoozeRinging(id: number, minutes: number) {
		console.log(`[AlarmManager] Snoozing ringing alarm ${id} for ${minutes} minutes`);
		const snoozedUntil = Date.now() + minutes * 60_000;
		await alarmNotificationService.cancelUpcomingNotification(id);
		await AlarmService.snooze(id, snoozedUntil);
		await this.stopRinging();
	}

	async snoozeUpcoming(id: number, minutes: number) {
		console.log(`[AlarmManager] Snoozing upcoming alarm ${id} for ${minutes} minutes`);
		const alarm = await AlarmService.get(id);
		const anchor = alarm?.nextTrigger ?? Date.now();
		// Floor ensures the new trigger is always in the future even if the alarm was slow to dismiss.
		const snoozedUntil = Math.max(Date.now() + 60_000, anchor + minutes * 60_000);
		await alarmNotificationService.cancelUpcomingNotification(id);
		await AlarmService.snooze(id, snoozedUntil);
	}

	private async scheduleNativeAlarm(
		id: number,
		timestamp: number,
		soundUri?: string | null,
	): Promise<boolean> {
		console.log(`Scheduling alarm ${id} for ${new Date(timestamp).toLocaleString()}`);
		try {
			await invoke('plugin:alarm-manager|schedule', {
				payload: { id, triggerAt: timestamp, soundUri },
			});
			return true;
		} catch (e: any) {
			console.error('Failed to schedule native alarm', e.message || e.toString());
			return false;
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
