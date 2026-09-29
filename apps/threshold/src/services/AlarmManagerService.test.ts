// Tests notification scheduling and action handling in the alarm manager service
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AlarmManagerService } from './AlarmManagerService';
import { AlarmMode } from '@threshold/core/types';
import { AlarmService } from './AlarmService';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import {
	sendNotification,
	registerActionTypes,
	onAction,
	cancel,
	removeActive,
} from '@tauri-apps/plugin-notification';
import { PlatformUtils } from '../utils/PlatformUtils';
import { showToast } from 'tauri-plugin-toast-api';
import { notificationToastService } from './NotificationToastService';

vi.mock('./AlarmService', () => ({
	AlarmService: {
		getAll: vi.fn(),
		get: vi.fn(),
		snooze: vi.fn(),
		dismiss: vi.fn(),
		reportFired: vi.fn(),
		toggle: vi.fn(),
		save: vi.fn(),
		delete: vi.fn(),
	},
}));

vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
	listen: vi.fn(),
	emit: vi.fn(),
}));

vi.mock('tauri-plugin-toast-api', () => ({
	showToast: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-notification', () => ({
	sendNotification: vi.fn(),
	registerActionTypes: vi.fn(),
	onAction: vi.fn(),
	cancel: vi.fn(),
	removeActive: vi.fn(),
	Schedule: {
		at: vi.fn((date: Date, repeating?: boolean, allowWhileIdle?: boolean) => ({
			at: { date, repeating: !!repeating, allowWhileIdle: !!allowWhileIdle },
			interval: undefined,
			every: undefined,
		})),
	},
}));

vi.mock('../utils/PlatformUtils', () => ({
	PlatformUtils: {
		isMobile: vi.fn().mockReturnValue(false),
		getPlatform: vi.fn().mockReturnValue('linux'),
	},
}));

describe('AlarmManagerService', () => {
	const localStorageState = new Map<string, string>();
	const eventListeners = new Map<string, Array<(event: any) => unknown>>();

	beforeEach(() => {
		vi.resetAllMocks();
		(notificationToastService as any).initPromise = null;
		localStorageState.clear();
		eventListeners.clear();

		(AlarmService.getAll as any).mockResolvedValue([]);
		(AlarmService.get as any).mockResolvedValue({
			id: 11,
			nextTrigger: Date.now() + 10 * 60_000,
		});
		(AlarmService.snooze as any).mockResolvedValue(undefined);
		(AlarmService.dismiss as any).mockResolvedValue(undefined);
		(AlarmService.reportFired as any).mockResolvedValue(undefined);
		(AlarmService.toggle as any).mockResolvedValue(undefined);
		(AlarmService.save as any).mockResolvedValue({ id: 99 });
		(AlarmService.delete as any).mockResolvedValue(undefined);

		(listen as any).mockImplementation(
			async (eventName: string, handler: (event: any) => unknown) => {
				const existing = eventListeners.get(eventName) ?? [];
				existing.push(handler);
				eventListeners.set(eventName, existing);
				return () => undefined;
			},
		);
		(emit as any).mockImplementation(async (eventName: string, payload?: unknown) => {
			const handlers = eventListeners.get(eventName) ?? [];
			for (const handler of handlers) {
				await handler({ payload });
			}
		});
		(invoke as any).mockImplementation((command: string) => {
			if (command === 'plugin:alarm-manager|get_launch_args') {
				return Promise.resolve([]);
			}
			return Promise.resolve(null);
		});

		(registerActionTypes as any).mockResolvedValue(undefined);
		(onAction as any).mockResolvedValue(undefined);
		(sendNotification as any).mockResolvedValue(undefined);
		(cancel as any).mockResolvedValue(undefined);
		(removeActive as any).mockResolvedValue(undefined);
		(showToast as any).mockResolvedValue(undefined);

		// @ts-ignore
		global.window = {
			...global.window,
			location: { pathname: '/' } as any,
		} as any;

		// @ts-ignore
		global.localStorage = {
			getItem: vi.fn((key: string) => localStorageState.get(key) ?? null),
			setItem: vi.fn((key: string, value: string) => {
				localStorageState.set(key, value);
			}),
			removeItem: vi.fn((key: string) => {
				localStorageState.delete(key);
			}),
			clear: vi.fn(() => {
				localStorageState.clear();
			}),
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('never invokes the removed check_active_alarm command during init', async () => {
		const service = new AlarmManagerService();

		await service.init();

		expect(invoke).not.toHaveBeenCalledWith(
			'plugin:alarm-manager|check_active_alarm',
			expect.anything(),
		);
		expect(invoke).not.toHaveBeenCalledWith('plugin:alarm-manager|check_active_alarm');
	});

	it('never invokes the native schedule command during init -- that is Rust-driven now', async () => {
		const service = new AlarmManagerService();
		const nextTrigger = Date.now() + 60_000;

		(AlarmService.getAll as any).mockResolvedValue([
			{
				id: 12,
				enabled: true,
				mode: AlarmMode.Fixed,
				fixedTime: '07:30',
				activeDays: [1],
				label: 'Weekday alarm',
				nextTrigger,
				soundUri: null,
				soundTitle: null,
			},
		]);

		await service.init();

		expect(invoke).not.toHaveBeenCalledWith('plugin:alarm-manager|schedule', expect.anything());
	});

	it('schedules upcoming notifications for enabled mobile alarms', async () => {
		const service = new AlarmManagerService();
		const nextTrigger = Date.now() + 30 * 60_000;
		(PlatformUtils.isMobile as any).mockReturnValue(true);

		(AlarmService.getAll as any).mockResolvedValue([
			{
				id: 12,
				enabled: true,
				mode: AlarmMode.Fixed,
				fixedTime: '07:30',
				activeDays: [1],
				label: 'Weekday alarm',
				nextTrigger,
				soundUri: null,
				soundTitle: null,
			},
		]);

		await service.init();

		// Scheduled natively (issue #325) -- no longer through the vendored notification plugin.
		expect(invoke).toHaveBeenCalledWith('plugin:alarm-manager|schedule_upcoming_notification', {
			payload: expect.objectContaining({
				id: 12,
				notifyAt: nextTrigger - 10 * 60_000,
				triggerAt: nextTrigger,
				title: 'Upcoming alarm',
				body: expect.stringContaining('Weekday alarm'),
				snoozeLabel: 'Snooze (10m)',
			}),
		});
		expect(sendNotification).not.toHaveBeenCalled();
		// The previous notification is cleared first, natively and (best-effort) via the legacy plugin path.
		expect(invoke).toHaveBeenCalledWith('plugin:alarm-manager|cancel_upcoming_notification', {
			payload: { id: 12 },
		});
		expect(cancel).toHaveBeenCalledWith([1_000_012]);
		expect(removeActive).toHaveBeenCalledWith([{ id: 1_000_012 }]);
	});

	it('snoozes ringing alarm with now-anchored timestamp and stops ringing (no id -- see stopRinging doc comment)', async () => {
		const service = new AlarmManagerService();
		const before = Date.now();

		await service.snoozeRinging(42, 10);

		const after = Date.now();
		const [calledId, calledTimestamp] = (AlarmService.snooze as any).mock.calls[0];
		expect(calledId).toBe(42);
		expect(calledTimestamp).toBeGreaterThanOrEqual(before + 10 * 60_000);
		expect(calledTimestamp).toBeLessThanOrEqual(after + 10 * 60_000);
		// snoozeRinging deliberately does not thread alarmId through stopRinging -- stopRinging's single native command is shared with dismiss, so doing so would misattribute an in-app snooze as a dismiss (see AlarmManagerService.stopRinging's doc comment).
		expect(invoke).toHaveBeenCalledWith('plugin:alarm-manager|stop_ringing', { alarmId: null });
	});

	it('clears upcoming notification when alarm starts ringing', async () => {
		const service = new AlarmManagerService();
		(PlatformUtils.isMobile as any).mockReturnValue(true);

		await (service as any).handleAlarmRing(17);

		expect(cancel).toHaveBeenCalledWith([1_000_017]);
		expect(removeActive).toHaveBeenCalledWith([{ id: 1_000_017 }]);
	});

	it('continues ringing flow if sendNotification fails', async () => {
		const service = new AlarmManagerService();
		(PlatformUtils.isMobile as any).mockReturnValue(true);
		(sendNotification as any).mockRejectedValueOnce(new Error('permission denied'));

		await (service as any).handleAlarmRing(23);

		expect(AlarmService.reportFired).toHaveBeenCalledWith(23, expect.any(Number));
	});

	it('registers dynamic snooze labels and refreshes them when snooze length changes', async () => {
		const service = new AlarmManagerService();
		(PlatformUtils.isMobile as any).mockReturnValue(true);

		localStorageState.set('threshold_snooze_length', '10');
		await service.init();

		expect(registerActionTypes).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'alarm_trigger',
					actions: expect.arrayContaining([
						expect.objectContaining({ id: 'snooze', title: 'Snooze (10m)' }),
					]),
				}),
			]),
		);

		localStorageState.set('threshold_snooze_length', '15');
		const settingsChangedHandlers = eventListeners.get('settings-changed') ?? [];
		expect(settingsChangedHandlers.length).toBeGreaterThan(0);
		for (const handler of settingsChangedHandlers) {
			await handler({ payload: { key: 'snoozeLength', value: 15 } });
		}

		expect(registerActionTypes).toHaveBeenLastCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'alarm_trigger',
					actions: expect.arrayContaining([
						expect.objectContaining({ id: 'snooze', title: 'Snooze (15m)' }),
					]),
				}),
			]),
		);
	});

	it('no longer registers an upcoming_alarm action type with the vendored plugin (issue #325)', async () => {
		const service = new AlarmManagerService();
		(PlatformUtils.isMobile as any).mockReturnValue(true);

		await service.init();

		const registered = (registerActionTypes as any).mock.calls.flatMap(
			(call: any[]) => call[0] as Array<{ id: string }>,
		);
		expect(registered.map((type: { id: string }) => type.id)).toEqual(['alarm_trigger']);
	});

	it('re-renders the natively-held upcoming Snooze label when snooze length changes', async () => {
		const service = new AlarmManagerService();
		(PlatformUtils.isMobile as any).mockReturnValue(true);
		const nextTrigger = Date.now() + 30 * 60_000;

		(AlarmService.getAll as any).mockResolvedValue([
			{
				id: 31,
				enabled: true,
				mode: AlarmMode.Fixed,
				fixedTime: '07:30',
				activeDays: [1],
				label: 'Label refresh alarm',
				nextTrigger,
				soundUri: null,
				soundTitle: null,
			},
		]);

		localStorageState.set('threshold_snooze_length', '10');
		await service.init();

		localStorageState.set('threshold_snooze_length', '15');
		(invoke as any).mockClear();
		for (const handler of eventListeners.get('settings-changed') ?? []) {
			await handler({ payload: { key: 'snoozeLength', value: 15 } });
		}

		expect(invoke).toHaveBeenCalledWith('plugin:alarm-manager|schedule_upcoming_notification', {
			payload: expect.objectContaining({ id: 31, snoozeLabel: 'Snooze (15m)' }),
		});
	});

	it('re-syncs upcoming notifications when 24-hour setting changes', async () => {
		const service = new AlarmManagerService();
		(PlatformUtils.isMobile as any).mockReturnValue(true);
		const nextTrigger = Date.now() + 30 * 60_000;

		(AlarmService.getAll as any).mockResolvedValue([
			{
				id: 21,
				enabled: true,
				mode: AlarmMode.Fixed,
				fixedTime: '07:30',
				activeDays: [1],
				label: 'Format refresh alarm',
				nextTrigger,
				soundUri: null,
				soundTitle: null,
			},
		]);

		await service.init();

		(invoke as any).mockClear();
		const settingsChangedHandlers = eventListeners.get('settings-changed') ?? [];
		expect(settingsChangedHandlers.length).toBeGreaterThan(0);
		for (const handler of settingsChangedHandlers) {
			await handler({ payload: { key: 'is24h', value: true } });
		}

		expect(invoke).toHaveBeenCalledWith('plugin:alarm-manager|schedule_upcoming_notification', {
			payload: expect.objectContaining({ id: 21 }),
		});
	});

	it('cancels the upcoming notification when alarm:cancelled fires (native cancel is Rust-driven)', async () => {
		const service = new AlarmManagerService();
		(PlatformUtils.isMobile as any).mockReturnValue(true);

		await service.init();

		const cancelledHandlers = eventListeners.get('alarm:cancelled') ?? [];
		expect(cancelledHandlers.length).toBe(1);

		for (const handler of cancelledHandlers) {
			await handler({ payload: { id: 5, reason: 'DELETED' } });
		}

		expect(cancel).toHaveBeenCalledWith([1_000_005]);
		expect(removeActive).toHaveBeenCalledWith([{ id: 1_000_005 }]);
	});

	it('publishes a snooze confirmation toast when alarm:snoozed fires, for any snooze source', async () => {
		const service = new AlarmManagerService();
		(PlatformUtils.isMobile as any).mockReturnValue(true);
		(PlatformUtils.getPlatform as any).mockReturnValue('android');

		await service.init();

		const snoozedHandlers = eventListeners.get('alarm:snoozed') ?? [];
		expect(snoozedHandlers.length).toBe(1);

		const originalTrigger = Date.now();
		const snoozedUntil = originalTrigger + 10 * 60_000;
		for (const handler of snoozedHandlers) {
			await handler({ payload: { id: 8, originalTrigger, snoozedUntil } });
		}

		expect(showToast).toHaveBeenCalled();
	});

	it('deleteAlarm only calls AlarmService.delete and relies on alarm:cancelled listener', async () => {
		const service = new AlarmManagerService();
		await service.deleteAlarm(99);

		expect(AlarmService.delete).toHaveBeenCalledWith(99);
		// cancelNativeAlarm is NOT called directly — handled by alarm:cancelled event
		expect(invoke).not.toHaveBeenCalledWith('plugin:alarm-manager|cancel', expect.anything());
	});

	// Note: the upcoming-alarm reminder's Dismiss/Snooze actions (issue #325) are also
	// handled entirely in Rust (the alarm-manager:upcoming-*-requested listeners), as are
	// the native AlarmRingingService dismiss/snooze actions -- both handled
	// entirely in Rust (apps/threshold-tauri/src/lib.rs's alarm-manager:*-requested
	// listeners) and never reach TS, so there's nothing to unit-test here for that
	// path — same as the pre-existing wear:alarm:dismiss/snooze listeners.

	it('threads the real alarm id through stopRinging (issue #255 Phase 4A in-app dismiss fix)', async () => {
		const service = new AlarmManagerService();

		await service.stopRinging(17);

		expect(invoke).toHaveBeenCalledWith('plugin:alarm-manager|stop_ringing', { alarmId: 17 });
	});

	it('stopRinging with no id passes alarmId: null (legacy ID-less fallback only)', async () => {
		const service = new AlarmManagerService();

		await service.stopRinging();

		expect(invoke).toHaveBeenCalledWith('plugin:alarm-manager|stop_ringing', { alarmId: null });
	});

	it('stops ringing for the alarm_trigger snooze action (no alarm ID available)', async () => {
		const service = new AlarmManagerService();
		let actionCallback: ((notification: any) => Promise<void>) | null = null;

		(PlatformUtils.isMobile as any).mockReturnValue(true);
		(onAction as any).mockImplementation(async (cb: (notification: any) => Promise<void>) => {
			actionCallback = cb;
			return undefined;
		});

		await service.init();
		expect(actionCallback).not.toBeNull();

		(invoke as any).mockClear();
		await actionCallback!({
			actionId: 'snooze',
			notification: {
				actionTypeId: 'alarm_trigger',
			},
		});

		expect(AlarmService.snooze).not.toHaveBeenCalled();
		expect(invoke).toHaveBeenCalledWith('plugin:alarm-manager|stop_ringing', { alarmId: null });
	});

	it('stops ringing for the alarm_trigger dismiss action (no alarm ID available)', async () => {
		const service = new AlarmManagerService();
		let actionCallback: ((notification: any) => Promise<void>) | null = null;

		(PlatformUtils.isMobile as any).mockReturnValue(true);
		(onAction as any).mockImplementation(async (cb: (notification: any) => Promise<void>) => {
			actionCallback = cb;
			return undefined;
		});

		await service.init();
		expect(actionCallback).not.toBeNull();

		(invoke as any).mockClear();
		await actionCallback!({
			actionId: 'dismiss',
			notification: {
				actionTypeId: 'alarm_trigger',
			},
		});

		expect(AlarmService.dismiss).not.toHaveBeenCalled();
		expect(invoke).toHaveBeenCalledWith('plugin:alarm-manager|stop_ringing', { alarmId: null });
	});

	it('seeds Rust snooze-length state from the persisted setting on init', async () => {
		const service = new AlarmManagerService();
		localStorageState.set('threshold_snooze_length', '15');

		await service.init();

		expect(invoke).toHaveBeenCalledWith('set_snooze_length', { minutes: 15 });
	});
});
