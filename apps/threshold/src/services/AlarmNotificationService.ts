// Orchestrates mobile alarm notification actions and upcoming-notification lifecycle
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { registerActionTypes, onAction, Schedule, cancel, removeActive, sendNotification } from '@tauri-apps/plugin-notification';
import { listen } from '@tauri-apps/api/event';
import { AlarmMode } from '@threshold/core/types';
import type { AlarmRecord } from '../types/alarm';
import { PlatformUtils } from '../utils/PlatformUtils';
import { SettingsService } from './SettingsService';
import { TimeFormatHelper } from '../utils/TimeFormatHelper';

const UPCOMING_NOTIFICATION_ID_OFFSET = 1_000_000;
const UPCOMING_NOTIFICATION_LEAD_MS = 10 * 60 * 1000;

type NotificationActionHandlers = {
	onDismissRinging: () => Promise<void>;
	onSnoozeRinging: () => Promise<void>;
	onDismissUpcoming: (alarmId: number) => Promise<void>;
	onSnoozeUpcoming: (alarmId: number, snoozeMinutes: number) => Promise<void>;
};

export type NotificationAction = {
	id: string;
	title: string;
	input?: boolean;
	destructive?: boolean;
	foreground?: boolean;
};

export type NotificationActionType = {
	id: string;
	actions: NotificationAction[];
};

type ActionTypeProvider = () => NotificationActionType[] | Promise<NotificationActionType[]>;
type ActionTypeHandler = (actionId: string, payload: { id?: unknown }) => Promise<void>;

export class AlarmNotificationService {
	private actionTypeProviders = new Map<string, ActionTypeProvider>();
	private actionTypeHandlers = new Map<string, ActionTypeHandler>();

	public registerActionTypeProvider(key: string, provider: ActionTypeProvider): void {
		this.actionTypeProviders.set(key, provider);
	}

	public removeActionTypeProvider(key: string): void {
		this.actionTypeProviders.delete(key);
	}

	private getUpcomingNotificationId(alarmId: number): number {
		return UPCOMING_NOTIFICATION_ID_OFFSET + alarmId;
	}

	private getAlarmIdFromUpcomingNotificationId(notificationId: number): number | null {
		const alarmId = notificationId - UPCOMING_NOTIFICATION_ID_OFFSET;
		return alarmId > 0 ? alarmId : null;
	}

	private getUpcomingTitle(alarm: AlarmRecord, is24h: boolean): string {
		if (alarm.mode === AlarmMode.RandomWindow && alarm.windowStart && alarm.windowEnd) {
			const start = TimeFormatHelper.formatTimeString(alarm.windowStart, is24h);
			const end = TimeFormatHelper.formatTimeString(alarm.windowEnd, is24h);
			return `Upcoming alarm (window ${start}-${end})`;
		}
		return 'Upcoming alarm';
	}

	private getUpcomingBody(alarm: AlarmRecord, nextTrigger: number, is24h: boolean): string {
		const label = alarm.label?.trim() || 'Alarm';
		const formattedTime = TimeFormatHelper.format(nextTrigger, is24h);
		return `Next alarm "${label}" at ${formattedTime}`;
	}

	private registerActionTypeHandlers(handlers: NotificationActionHandlers) {
		this.actionTypeHandlers.set('alarm_trigger', async (actionId) => {
			if (actionId === 'dismiss') {
				await handlers.onDismissRinging();
			} else if (actionId === 'snooze') {
				await handlers.onSnoozeRinging();
			}
		});

		this.actionTypeHandlers.set('upcoming_alarm', async (actionId, payload) => {
			const rawId = payload.id;
			const notificationId =
				typeof rawId === 'number' ? rawId : Number.parseInt(String(rawId ?? ''), 10);
			if (Number.isNaN(notificationId)) {
				console.error('[AlarmNotifications] Upcoming action missing notification ID');
				return;
			}

			const alarmId = this.getAlarmIdFromUpcomingNotificationId(notificationId);
			if (!alarmId) {
				console.error(`[AlarmNotifications] Invalid upcoming notification ID: ${notificationId}`);
				return;
			}

			await this.cancelUpcomingNotification(alarmId);

			if (actionId === 'dismiss_alarm') {
				await handlers.onDismissUpcoming(alarmId);
			} else if (actionId === 'snooze_alarm') {
				const snoozeLength = SettingsService.getSnoozeLength();
				await handlers.onSnoozeUpcoming(alarmId, snoozeLength);
			}
		});
	}

	private async refreshRegisteredActionTypes() {
		const providedActionTypes = await Promise.all(
			[...this.actionTypeProviders.values()].map(async (provider) => provider()),
		);
		const flattened = providedActionTypes.flat();
		const deduplicatedById = new Map<string, NotificationActionType>();
		for (const actionType of flattened) {
			deduplicatedById.set(actionType.id, actionType);
		}

		await registerActionTypes([...deduplicatedById.values()]);
	}

	public async refreshActionTypes(): Promise<void> {
		await this.refreshRegisteredActionTypes();
	}

	async initialiseMobileNotificationActions(handlers: NotificationActionHandlers): Promise<void> {
		if (!PlatformUtils.isMobile()) return;

		this.registerActionTypeHandlers(handlers);
		await this.refreshRegisteredActionTypes();

		await listen<{ key?: string; value?: unknown }>('settings-changed', async (event) => {
			if (event.payload?.key === 'snoozeLength') {
				await this.refreshRegisteredActionTypes();
			}
		});

		await onAction(async (notification) => {
			console.log('[AlarmNotifications] Action performed:', notification);

			const actionTypeId = (notification as any).actionTypeId;
			const actionId = (notification as any).actionId;
			if (typeof actionTypeId !== 'string' || typeof actionId !== 'string') {
				return;
			}

			const handler = this.actionTypeHandlers.get(actionTypeId);
			if (!handler) {
				return;
			}

			await handler(actionId, { id: (notification as any).id });
		});
	}

	async cancelUpcomingNotification(alarmId: number): Promise<void> {
		if (!PlatformUtils.isMobile()) return;

		const notificationId = this.getUpcomingNotificationId(alarmId);
		try {
			await cancel([notificationId]);
		} catch (e) {
			console.warn(`[AlarmNotifications] Failed to cancel pending upcoming notification ${notificationId}`, e);
		}

		try {
			await removeActive([{ id: notificationId }]);
		} catch (e) {
			console.warn(`[AlarmNotifications] Failed to clear active upcoming notification ${notificationId}`, e);
		}
	}

	async scheduleUpcomingNotification(alarm: AlarmRecord, nextTrigger: number): Promise<void> {
		if (!PlatformUtils.isMobile()) return;

		await this.cancelUpcomingNotification(alarm.id);
		const notificationId = this.getUpcomingNotificationId(alarm.id);
		const notifyAt = nextTrigger - UPCOMING_NOTIFICATION_LEAD_MS;
		const shouldSendImmediately = notifyAt <= Date.now();
		const is24h = SettingsService.getIs24h();

		try {
			await sendNotification({
				id: notificationId,
				title: this.getUpcomingTitle(alarm, is24h),
				body: this.getUpcomingBody(alarm, nextTrigger, is24h),
				actionTypeId: 'upcoming_alarm',
				autoCancel: true,
				schedule: shouldSendImmediately ? undefined : Schedule.at(new Date(notifyAt), false, true),
			});
		} catch (e) {
			console.error(`[AlarmNotifications] Failed to schedule upcoming notification for alarm ${alarm.id}`, e);
		}
	}
}
