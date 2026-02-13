import { databaseService } from './DatabaseService';
import { APP_NAME, ROUTES } from '../constants';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { PlatformUtils } from '../utils/PlatformUtils';
import {
	sendNotification,
	registerActionTypes,
	onAction,
	Schedule,
	cancel as cancelNotification,
	removeActive,
} from '@tauri-apps/plugin-notification';
import { Alarm, AlarmMode, DayOfWeek } from '@threshold/core/types';
import { calculateNextTrigger as calcTrigger } from '@threshold/core/scheduler';
import { SettingsService } from './SettingsService';
import { TimeFormatHelper } from '../utils/TimeFormatHelper';
import { showToast } from 'tauri-plugin-toast-api';

// Define the plugin invoke types manually since we can't import from the plugin in this environment
interface ImportedAlarm {
	id: number;
	hour: number;
	minute: number;
	label: string;
}

// Reserve a separate numeric ID range for upcoming notifications so they do not
// collide with alarm IDs used by other notification flows (e.g., snooze reminder).
const UPCOMING_NOTIFICATION_ID_OFFSET = 1_000_000;
const UPCOMING_NOTIFICATION_LEAD_MS = 10 * 60 * 1000;

export class AlarmManagerService {
	private initPromise: Promise<void> | null = null;
	private router: any = null;
	private pendingFiredAlarm: { id: number; firedAt: number } | null = null;
	private isHandlingAlarmRing = false;
	private pendingAlarmRingIds: number[] = [];
	private queuedAlarmRingIds = new Set<number>();
	private handlingAlarmRingIds = new Set<number>();

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
				await databaseService.init();
				console.log('[AlarmManager] Database service ready.');

				// Only the main window (controller) should listen for alarm rings and spawn windows.
				// If we are already in a Ringing Window, we shouldn't spawn new ones recursively.
				if (this.getRingingAlarmIdFromPath() === null) {
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
				} else {
					console.log(
						'[AlarmManager] Skipping alarm-ring listener registration (this is a Ringing Window)',
					);
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

				const ringingAlarmId = this.getRingingAlarmIdFromPath();
				if (ringingAlarmId !== null) {
					const firedAt = Date.now();
					this.pendingFiredAlarm = { id: ringingAlarmId, firedAt };
					console.log(
						`[AlarmManager] Ringing route detected on init. Marking alarm ${ringingAlarmId} as fired.`,
					);
					await this.markAlarmFired(ringingAlarmId, firedAt);
				}

				console.log('[AlarmManager] Rescheduling all alarms...');
				await this.rescheduleAll();
				console.log('[AlarmManager] Reschedule complete.');

				console.log('[AlarmManager] Service initialization complete.');

				// Check if app was launched by an alarm notification (do this AFTER init completes)
				console.log('[AlarmManager] Checking for active alarm...');
				await this.checkActiveAlarm();

				// Register Notification Actions (Mobile Only)
				if (PlatformUtils.isMobile()) {
					console.log('[AlarmManager] Registering notification actions...');
					try {
						const snoozeLength = SettingsService.getSnoozeLength();
						const snoozeActionTitle = `Snooze (${snoozeLength}m)`;

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
										title: snoozeActionTitle,
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
							{
								id: 'snooze_reminder',
								actions: [
									{
										id: 'clear_snooze',
										title: 'Clear Snooze',
										destructive: true,
										foreground: false,
									},
									{
										id: 'open_app',
										title: 'Open App',
										foreground: true,
									},
									{
										id: 'snooze_again',
										title: 'Snooze Again',
										foreground: false,
									},
								],
							},
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
						]);

						await onAction(async (notification) => {
							console.log('[AlarmManager] Action performed:', notification);

							const actionTypeId = (notification as any).actionTypeId;
							const actionId = (notification as any).actionId;
							const alarmId = (notification as any).id ? parseInt((notification as any).id) : null;

							// Handle alarm_trigger actions
							if (actionTypeId === 'alarm_trigger') {
								if (actionId === 'dismiss') {
									console.log('[AlarmManager] Action: Dismiss');
									this.stopRinging();
								} else if (actionId === 'snooze') {
									console.log('[AlarmManager] Action: Snooze');
									this.stopRinging();
								}
								return;
							}

							// Handle snooze_reminder actions
							if (actionTypeId === 'snooze_reminder') {
								if (!alarmId) {
									console.error('[AlarmManager] Snooze action missing alarm ID');
									return;
								}

								if (actionId === 'clear_snooze') {
									console.log('[AlarmManager] Action: Clear Snooze for alarm', alarmId);
									// Cancel the snoozed alarm
									await this.cancelNativeAlarm(alarmId);
									// Reschedule the alarm to its normal next trigger
									const alarm = await this.getAlarm(alarmId);
									if (alarm) {
										await this.saveAndSchedule(alarm);
									}
								} else if (actionId === 'open_app') {
									console.log('[AlarmManager] Action: Open App');
									// Navigate to home screen (app will come to foreground automatically)
									if (this.router) {
										this.router.navigate({ to: ROUTES.HOME });
									}
								} else if (actionId === 'snooze_again') {
									console.log('[AlarmManager] Action: Snooze Again for alarm', alarmId);
									// Get current snooze duration from settings
									const snoozeLength = SettingsService.getSnoozeLength();
									// Snooze again
									await this.snoozeAlarm(alarmId, snoozeLength);
								}
								return;
							}

							if (actionTypeId === 'upcoming_alarm') {
								if (!alarmId) {
									console.error('[AlarmManager] Upcoming action missing notification ID');
									return;
								}

								const upcomingAlarmId = this.getAlarmIdFromUpcomingNotificationId(alarmId);
								if (!upcomingAlarmId) {
									console.error(
										`[AlarmManager] Invalid upcoming notification ID received: ${alarmId}`,
									);
									return;
								}

								if (actionId === 'dismiss_alarm') {
									console.log('[AlarmManager] Action: Dismiss upcoming alarm', upcomingAlarmId);
									await this.dismissNextOccurrence(upcomingAlarmId);
								} else if (actionId === 'snooze_alarm') {
									console.log('[AlarmManager] Action: Snooze upcoming alarm', upcomingAlarmId);
									const snoozeLength = SettingsService.getSnoozeLength();
									const newTrigger = await this.snoozeAlarm(upcomingAlarmId, snoozeLength, false);
									const updatedAlarm = await this.getAlarm(upcomingAlarmId);
									if (updatedAlarm && newTrigger) {
										await this.showSnoozeToast(snoozeLength, newTrigger);
									}
								}
								return;
							}

							console.log('[AlarmManager] Ignoring action from unknown category:', actionTypeId);
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

	private getRingingAlarmIdFromPath(): number | null {
		const match = window.location.pathname.match(/^\/ringing\/(\d+)/);
		if (!match) return null;
		const parsed = Number.parseInt(match[1], 10);
		return Number.isNaN(parsed) ? null : parsed;
	}

	private getUpcomingNotificationId(alarmId: number): number {
		return UPCOMING_NOTIFICATION_ID_OFFSET + alarmId;
	}

	private getAlarmIdFromUpcomingNotificationId(notificationId: number): number | null {
		const alarmId = notificationId - UPCOMING_NOTIFICATION_ID_OFFSET;
		return alarmId > 0 ? alarmId : null;
	}

	private getUpcomingTitle(alarm: Alarm, is24h: boolean): string {
		if (alarm.mode === AlarmMode.RandomWindow && alarm.windowStart && alarm.windowEnd) {
			const start = TimeFormatHelper.formatTimeString(alarm.windowStart, is24h);
			const end = TimeFormatHelper.formatTimeString(alarm.windowEnd, is24h);
			return `Upcoming alarm (window ${start}-${end})`;
		}
		return 'Upcoming alarm';
	}

	private getUpcomingBody(alarm: Alarm, nextTrigger: number, is24h: boolean): string {
		const label = alarm.label?.trim() || 'Alarm';
		const formattedTime = TimeFormatHelper.format(nextTrigger, is24h);
		return `Next alarm "${label}" at ${formattedTime}`;
	}

	private async cancelUpcomingNotification(alarmId: number): Promise<void> {
		const notificationId = this.getUpcomingNotificationId(alarmId);
		try {
			await cancelNotification([notificationId]);
		} catch (e) {
			console.warn(`[AlarmManager] Failed to cancel pending upcoming notification ${notificationId}`, e);
		}

		try {
			await removeActive([{ id: notificationId }]);
		} catch (e) {
			console.warn(`[AlarmManager] Failed to clear active upcoming notification ${notificationId}`, e);
		}
	}

	private async scheduleUpcomingNotification(alarm: Alarm, nextTrigger: number): Promise<void> {
		if (!PlatformUtils.isMobile()) return;

		const notificationId = this.getUpcomingNotificationId(alarm.id);
		await this.cancelUpcomingNotification(alarm.id);

		const now = Date.now();
		const notifyAt = nextTrigger - UPCOMING_NOTIFICATION_LEAD_MS;
		const shouldSendImmediately = notifyAt <= now;
		const is24h = SettingsService.getIs24h();

		try {
			sendNotification({
				id: notificationId,
				title: this.getUpcomingTitle(alarm, is24h),
				body: this.getUpcomingBody(alarm, nextTrigger, is24h),
				actionTypeId: 'upcoming_alarm',
				autoCancel: true,
				schedule: shouldSendImmediately ? undefined : Schedule.at(new Date(notifyAt), false, true),
			});
		} catch (e) {
			console.error(`[AlarmManager] Failed to schedule upcoming notification for alarm ${alarm.id}`, e);
		}
	}

	private async dismissNextOccurrence(alarmId: number): Promise<void> {
		const alarm = await this.getAlarm(alarmId);
		if (!alarm || !alarm.nextTrigger) {
			console.error(`[AlarmManager] Cannot dismiss next occurrence for alarm ${alarmId}: not found`);
			return;
		}

		await this.cancelNativeAlarm(alarmId);
		await this.cancelUpcomingNotification(alarmId);
		await this.saveAndSchedule({
			...alarm,
			lastFiredAt: alarm.nextTrigger,
		});
	}

	private async showSnoozeToast(durationMinutes: number, nextTrigger: number): Promise<void> {
		if (PlatformUtils.getPlatform() !== 'android') return;

		const is24h = SettingsService.getIs24h();
		const formattedTime = TimeFormatHelper.format(nextTrigger, is24h);
		const message = `Alarm snoozed for ${durationMinutes} min and will go off at ${formattedTime}`;

		try {
			await showToast({
				message,
				duration: 'short',
				position: 'bottom',
			});
		} catch (e) {
			console.warn('[AlarmManager] Failed to show toast confirmation', e);
		}
	}

	private async markAlarmFired(id: number, firedAt: number) {
		const alarm = await this.getAlarm(id);
		if (!alarm) {
			console.error(`[AlarmManager] Failed to mark fired: Alarm ${id} not found`);
			return;
		}

		console.log(
			`[AlarmManager] Marking alarm ${id} as fired at ${new Date(firedAt).toLocaleString()}`,
		);
		await databaseService.saveAlarm({
			...alarm,
			lastFiredAt: firedAt,
		});
	}

	// Re-hydrate all alarms on startup (send to Rust scheduler)
	async rescheduleAll() {
		console.log('[AlarmManager] Rescheduling all alarms...');
		const alarms = await databaseService.getAllAlarms();
		for (const alarm of alarms) {
			if (alarm.enabled && alarm.nextTrigger) {
				const pendingFired =
					this.pendingFiredAlarm && alarm.id === this.pendingFiredAlarm.id
						? this.pendingFiredAlarm
						: null;
				const rescheduleAlarm =
					pendingFired && !alarm.lastFiredAt
						? { ...alarm, lastFiredAt: pendingFired.firedAt }
						: alarm;

				// If trigger is in the future, schedule it
				if (alarm.nextTrigger > Date.now()) {
					const nextTrigger = rescheduleAlarm.nextTrigger ?? alarm.nextTrigger;
					await this.scheduleNativeAlarm(rescheduleAlarm.id, nextTrigger);
				} else {
					// Missed alarm? For now, maybe just calc next trigger
					console.log(
						`[AlarmManager] Alarm ${alarm.id} missed trigger at ${new Date(alarm.nextTrigger).toLocaleString()}. Rescheduling next.`,
					);
					const missedAlarm =
						rescheduleAlarm.mode === AlarmMode.RandomWindow &&
						rescheduleAlarm.nextTrigger &&
						!rescheduleAlarm.lastFiredAt
							? { ...rescheduleAlarm, lastFiredAt: rescheduleAlarm.nextTrigger }
							: rescheduleAlarm;
					this.saveAndSchedule(missedAlarm);
				}
			}
		}

		this.pendingFiredAlarm = null;
	}

	async loadAlarms(): Promise<Alarm[]> {
		return await databaseService.getAllAlarms();
	}

	/**
	 * Gets a single alarm by ID
	 */
	async getAlarm(id: number): Promise<Alarm | undefined> {
		const alarms = await databaseService.getAllAlarms();
		return alarms.find((a) => a.id === id);
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
		const updatedAlarm = { ...alarm, enabled };
		if (enabled) {
			this.rescheduleAlarm(updatedAlarm);
		} else {
			await this.cancelNativeAlarm(alarm.id);
			await this.cancelUpcomingNotification(alarm.id);
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
		console.log(
			`[AlarmManager] Configuring alarm: Label="${alarm.label}", Enabled=${alarm.enabled}, Days=[${alarm.activeDays}]`,
		);
		console.log(
			`[AlarmManager] Scheduling context: mode=${alarm.mode} lastFiredAt=${alarm.lastFiredAt ?? 'none'} windowStart=${alarm.windowStart ?? 'n/a'} windowEnd=${alarm.windowEnd ?? 'n/a'}`,
		);

		const coreAlarm = {
			...alarm,
			id: alarm.id || 0, // Temp ID for calc
			activeDays: alarm.activeDays as DayOfWeek[],
		};

		const nextTrigger = calcTrigger(coreAlarm);
		if (nextTrigger) {
			console.log(
				`[AlarmManager] Next trigger calculated: ${new Date(nextTrigger).toLocaleString()} (${nextTrigger})`,
			);
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
			await this.scheduleUpcomingNotification({ ...alarm, id } as Alarm, nextTrigger);
		} else {
			await this.cancelNativeAlarm(id);
			await this.cancelUpcomingNotification(id);
		}

		this.notifyGlobalListeners();
		return id;
	}

	async deleteAlarm(id: number) {
		console.log(`[DELETE_DEBUG] AlarmManagerService.deleteAlarm(${id}) called`);
		await this.cancelNativeAlarm(id);
		await this.cancelUpcomingNotification(id);
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
		if (this.handlingAlarmRingIds.has(id) || this.queuedAlarmRingIds.has(id)) {
			console.warn(`[AlarmManager] Alarm ${id} is already queued or being handled. Skipping duplicate event.`);
			return;
		}

		this.pendingAlarmRingIds.push(id);
		this.queuedAlarmRingIds.add(id);

		if (this.isHandlingAlarmRing) {
			console.log(`[AlarmManager] Alarm ${id} queued while another alarm ring is being handled.`);
			return;
		}

		while (this.pendingAlarmRingIds.length > 0) {
			const nextAlarmId = this.pendingAlarmRingIds.shift();
			if (nextAlarmId === undefined) continue;

			this.queuedAlarmRingIds.delete(nextAlarmId);
			this.handlingAlarmRingIds.add(nextAlarmId);
			this.isHandlingAlarmRing = true;

			try {
				const firedAt = Date.now();
				console.log(
					`[AlarmManager] Alarm ring received for ${nextAlarmId} at ${new Date(firedAt).toLocaleString()}`,
				);
				await this.cancelUpcomingNotification(nextAlarmId);

				// 1. Send Notification
				const isMobile = PlatformUtils.isMobile();
				sendNotification({
					title: APP_NAME,
					body: 'Your alarm is ringing!',
					actionTypeId: isMobile ? 'alarm_trigger' : undefined,
				});

				// 2. Open Floating Window (Singleton-ish: ensure only one is open by closing others)
				try {
					const { WebviewWindow, getAllWebviewWindows } =
						await import('@tauri-apps/api/webviewWindow');
					const isMobile = PlatformUtils.isMobile();

					if (isMobile) {
						console.log(
							'[AlarmManager] Mobile detected. Navigating current window to ringing screen.',
						);
						if (this.router) {
							this.router.navigate({
								to: '/ringing/$id',
								params: { id: nextAlarmId.toString() },
							});
						} else {
							console.error(
								'[AlarmManager] Router not initialized, cannot navigate to ringing screen',
							);
						}
					} else {
						// START DYNAMIC LABEL LOGIC
						// Close any existing ringing windows to ensure we get a fresh window (fixing caching/sizing issues)
						const allWindows = await getAllWebviewWindows();
						const existingRingingWindows = allWindows.filter((w: any) =>
							w.label.startsWith('ringing-window-'),
						);

						for (const w of existingRingingWindows) {
							console.log(`[AlarmManager] Closing existing ringing window: ${w.label}`);
							try {
								await w.close();
							} catch (e) {
								console.warn(`[AlarmManager] Failed to close window ${w.label}`, e);
							}
						}

						// Generate dynamic label
						const label = `ringing-window-${Date.now()}`;

						const webview = new WebviewWindow(label, {
							url: `/ringing/${nextAlarmId}`,
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
					}
				} catch (err) {
					console.error('Failed to open alarm window', err);
				}

				// 3. Auto-Reschedule (Calculate next trigger)
				console.log(
					`[AlarmManager] Alarm ${nextAlarmId} fired. Rescheduling next occurrence...`,
				);
				const alarms = await databaseService.getAllAlarms();
				const alarm = alarms.find((a) => a.id === nextAlarmId);
				if (alarm) {
					await this.saveAndSchedule({ ...alarm, lastFiredAt: firedAt });
				}
			} finally {
				this.handlingAlarmRingIds.delete(nextAlarmId);
				this.isHandlingAlarmRing = false;
			}
		}
	}

	async snoozeAlarm(
		id: number,
		durationMinutes: number,
		sendSnoozeReminderNotification: boolean = true,
	): Promise<number | null> {
		console.log(`[AlarmManager] Snoozing alarm ${id} for ${durationMinutes} minutes`);
		const alarms = await databaseService.getAllAlarms();
		const alarm = alarms.find((a) => a.id === id);

		if (!alarm) {
			console.error(`[AlarmManager] Cannot snooze: Alarm ${id} not found`);
			return null;
		}

		const nextTrigger = Date.now() + durationMinutes * 60 * 1000;

		// Update DB to reflect snooze time
		await databaseService.saveAlarm({
			...alarm,
			nextTrigger,
		});

		// Schedule Native
		await this.scheduleNativeAlarm(id, nextTrigger, alarm.soundUri);
		await this.scheduleUpcomingNotification(alarm, nextTrigger);

		// Send persistent notification for mobile
		if (sendSnoozeReminderNotification && PlatformUtils.isMobile()) {
			try {
				await sendNotification({
					title: `Alarm Snoozed`,
					body: `"${alarm.label || 'Alarm'}" will ring again in ${durationMinutes} minutes`,
					actionTypeId: 'snooze_reminder',
					ongoing: true,
					id: id, // Numeric ID for Tauri notification
				});
			} catch (e) {
				console.error('[AlarmManager] Failed to send snooze notification:', e);
			}
		}

		this.notifyGlobalListeners();
		return nextTrigger;
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
