// Orchestrates mobile alarm notification actions and upcoming-notification lifecycle
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
	registerActionTypes,
	onAction,
	cancel,
	removeActive,
} from '@tauri-apps/plugin-notification';
import { emit, listen } from '@tauri-apps/api/event';
import {
	cancelUpcomingNotification as cancelUpcomingNotificationNative,
	scheduleUpcomingNotification as scheduleUpcomingNotificationNative,
} from 'tauri-plugin-alarm-manager-api';
import { AlarmMode } from '@threshold/core/types';
import type { AlarmRecord } from '../types/alarm';
import { PlatformUtils } from '../utils/PlatformUtils';
import { SettingsService } from './SettingsService';
import { TimeFormatHelper } from '../utils/TimeFormatHelper';

const UPCOMING_NOTIFICATION_ID_OFFSET = 1_000_000;
const UPCOMING_NOTIFICATION_LEAD_MS = 10 * 60 * 1000;
const EVENT_NOTIFICATIONS_ACTION_TYPES_REFRESH = 'notifications:action-types:refresh';
const EVENT_NOTIFICATIONS_UPCOMING_RESYNC = 'notifications:upcoming:resync';
const EVENT_NOTIFICATIONS_TOAST = 'notifications:toast';

type NotificationActionHandlers = {
	// The native AlarmRingingService dismiss/snooze actions go straight from
	// Kotlin to Rust (see apps/threshold/src-tauri/src/lib.rs) without coming
	// through TS at all, so these only ever fire from the JS-driven
	// 'alarm_trigger' notification action, which has no alarm ID.
	onDismissRinging: () => Promise<void>;
	onSnoozeRinging: () => Promise<void>;
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

export type NotificationUpcomingResyncReason =
	| 'alarm-batch-updated'
	| 'settings-24h-changed'
	| 'snooze-length-changed'
	| 'manual';

export type NotificationUpcomingResyncEvent = {
	reason: NotificationUpcomingResyncReason;
	alarmIds?: number[];
};

export type NotificationToastKind = 'upcoming-snoozed' | 'alarm-dismissed' | 'generic';

export type NotificationToastEvent = {
	kind: NotificationToastKind;
	message: string;
	platform?: 'android' | 'ios' | 'desktop';
};

type ActionTypeProvider = () => NotificationActionType[] | Promise<NotificationActionType[]>;
type ActionTypeHandler = (actionId: string, payload: { id?: unknown }) => Promise<void>;
type NotificationPayloadRecord = Record<string, unknown>;

type ParsedNotificationAction = {
	actionId?: string;
	actionTypeId?: string;
	notificationId?: unknown;
	diagnosticPayload: NotificationPayloadRecord;
};

export class AlarmNotificationService {
	private actionTypeProviders = new Map<string, ActionTypeProvider>();
	private actionTypeHandlers = new Map<string, ActionTypeHandler>();

	public registerActionTypeProvider(key: string, provider: ActionTypeProvider): void {
		this.actionTypeProviders.set(key, provider);
		void this.requestActionTypesRefresh();
	}

	public removeActionTypeProvider(key: string): void {
		this.actionTypeProviders.delete(key);
		void this.requestActionTypesRefresh();
	}

	private getUpcomingNotificationId(alarmId: number): number {
		return UPCOMING_NOTIFICATION_ID_OFFSET + alarmId;
	}

	private getUpcomingTitle(alarm: AlarmRecord, is24h: boolean): string {
		if (alarm.mode === AlarmMode.Window && alarm.windowStart && alarm.windowEnd) {
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

	private async requestActionTypesRefresh(): Promise<void> {
		await emit(EVENT_NOTIFICATIONS_ACTION_TYPES_REFRESH);
	}

	private getRecord(value: unknown): NotificationPayloadRecord {
		if (Array.isArray(value)) {
			// Android bridge can wrap payloads in a single-entry array during replay.
			if (value.length === 1) {
				return this.getRecord(value[0]);
			}
			return {};
		}

		if (!value || typeof value !== 'object') {
			return {};
		}

		const record = value as NotificationPayloadRecord;
		const wrapped = record.nameValuePairs;
		// org.json objects can surface as `{ nameValuePairs: {...} }` in the WebView bridge.
		if (wrapped && typeof wrapped === 'object') {
			return this.getRecord(wrapped);
		}

		return record;
	}

	private serialiseForLog(value: unknown): string {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}

	private parseActionPayload(notification: unknown): ParsedNotificationAction {
		const topLevel = this.getRecord(notification);
		const nestedNotification = this.getRecord(topLevel.notification);

		const actionIdRaw = topLevel.actionId;
		const actionTypeIdRaw = nestedNotification.actionTypeId ?? topLevel.actionTypeId;
		const notificationId = nestedNotification.id ?? topLevel.id;

		return {
			actionId: typeof actionIdRaw === 'string' ? actionIdRaw : undefined,
			actionTypeId: typeof actionTypeIdRaw === 'string' ? actionTypeIdRaw : undefined,
			notificationId,
			diagnosticPayload: {
				actionId: actionIdRaw,
				actionTypeId: actionTypeIdRaw,
				notificationId,
				raw: topLevel,
			},
		};
	}

	public async requestUpcomingResync(payload: NotificationUpcomingResyncEvent): Promise<void> {
		await emit(EVENT_NOTIFICATIONS_UPCOMING_RESYNC, payload);
	}

	public async publishToast(payload: NotificationToastEvent): Promise<void> {
		await emit(EVENT_NOTIFICATIONS_TOAST, payload);
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

		await listen(EVENT_NOTIFICATIONS_ACTION_TYPES_REFRESH, async () => {
			await this.refreshRegisteredActionTypes();
		});

		await onAction(async (notification) => {
			const parsed = this.parseActionPayload(notification);
			console.log(
				`[AlarmNotifications] Action performed: ${this.serialiseForLog(parsed.diagnosticPayload)}`,
			);

			if (!parsed.actionTypeId || !parsed.actionId) {
				console.warn(
					`[AlarmNotifications] Ignoring action with missing fields: ${this.serialiseForLog(parsed.diagnosticPayload)}`,
				);
				return;
			}

			const handler = this.actionTypeHandlers.get(parsed.actionTypeId);
			if (!handler) {
				return;
			}

			await handler(parsed.actionId, { id: parsed.notificationId });
		});

		// Note: the native AlarmRingingService dismiss/snooze actions (ACTION_DISMISS,
		// ACTION_SNOOZE) are handled entirely in Rust — see the
		// alarm-manager:dismiss-requested / alarm-manager:snooze-requested listeners in
		// apps/threshold/src-tauri/src/lib.rs. TS never sees those events.
	}

	async cancelUpcomingNotification(alarmId: number): Promise<void> {
		if (!PlatformUtils.isMobile()) return;

		try {
			await cancelUpcomingNotificationNative({ id: alarmId });
		} catch (e) {
			console.warn(
				`[AlarmNotifications] Failed to cancel native upcoming notification for alarm ${alarmId}`,
				e,
			);
		}

		// Best-effort cleanup of any upcoming notification a build from before issue #325 left
		// scheduled or posted through the vendored notification plugin (same notification ID).
		// Safe to remove once those installs have had a release or two to update.
		const legacyNotificationId = this.getUpcomingNotificationId(alarmId);
		try {
			await cancel([legacyNotificationId]);
		} catch (e) {
			console.warn(
				`[AlarmNotifications] Failed to cancel legacy upcoming notification ${legacyNotificationId}`,
				e,
			);
		}

		try {
			await removeActive([{ id: legacyNotificationId }]);
		} catch (e) {
			console.warn(
				`[AlarmNotifications] Failed to clear legacy upcoming notification ${legacyNotificationId}`,
				e,
			);
		}
	}

	// The notification itself is built, scheduled, and posted natively (see the alarm-manager
	// plugin's UpcomingAlarmNotifier), and its Dismiss/Snooze taps go straight to Rust -- TS
	// only supplies the settings-dependent text and the schedule.
	async scheduleUpcomingNotification(alarm: AlarmRecord, nextTrigger: number): Promise<void> {
		if (!PlatformUtils.isMobile()) return;

		await this.cancelUpcomingNotification(alarm.id);
		const is24h = SettingsService.getIs24h();

		try {
			await scheduleUpcomingNotificationNative({
				id: alarm.id,
				// Native posts immediately if this is already in the past.
				notifyAt: nextTrigger - UPCOMING_NOTIFICATION_LEAD_MS,
				triggerAt: nextTrigger,
				title: this.getUpcomingTitle(alarm, is24h),
				body: this.getUpcomingBody(alarm, nextTrigger, is24h),
				snoozeLabel: `Snooze (${SettingsService.getSnoozeLength()}m)`,
			});
		} catch (e) {
			console.error(
				`[AlarmNotifications] Failed to schedule upcoming notification for alarm ${alarm.id}`,
				e,
			);
		}
	}
}

export const alarmNotificationService = new AlarmNotificationService();
