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

		(listen as any).mockImplementation(async (eventName: string, handler: (event: any) => unknown) => {
			const existing = eventListeners.get(eventName) ?? [];
			existing.push(handler);
			eventListeners.set(eventName, existing);
			return () => undefined;
		});
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
			if (command === 'plugin:alarm-manager|check_active_alarm') {
				return Promise.resolve({ isAlarm: false, alarmId: null });
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

	it('schedules enabled alarms returned during initial sync', async () => {
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

		expect(invoke).toHaveBeenCalledWith('plugin:alarm-manager|schedule', {
			payload: { id: 12, triggerAt: nextTrigger, soundUri: null },
		});
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

		expect(cancel).toHaveBeenCalledWith([1_000_012]);
		expect(removeActive).toHaveBeenCalledWith([{ id: 1_000_012 }]);
		expect(sendNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 1_000_012,
				actionTypeId: 'upcoming_alarm',
			}),
		);
	});

	it('cancels removed alarms on sync', async () => {
		const service = new AlarmManagerService();
		const nextTrigger = Date.now() + 60_000;

		await (service as any).syncNativeAlarms([
			{
				id: 7,
				enabled: true,
				mode: AlarmMode.Fixed,
				fixedTime: '06:45',
				activeDays: [1],
				label: 'Morning alarm',
				nextTrigger,
				soundUri: null,
				soundTitle: null,
			},
		]);

		await (service as any).syncNativeAlarms([]);

		expect(invoke).toHaveBeenCalledWith('plugin:alarm-manager|cancel', {
			payload: { id: 7 },
		});
	});

	it('snoozes alarms and stops the current ring by default', async () => {
		const service = new AlarmManagerService();

		await service.snoozeAlarm(42, 10);

		expect(AlarmService.snooze).toHaveBeenCalledWith(42, 10);
		expect(invoke).toHaveBeenCalledWith('plugin:alarm-manager|stop_ringing');
	});

	it('dismisses upcoming actions by mapping notification ID to alarm ID', async () => {
		const service = new AlarmManagerService();
		let actionCallback: ((notification: any) => Promise<void>) | null = null;

		(PlatformUtils.isMobile as any).mockReturnValue(true);
		(onAction as any).mockImplementation(async (cb: (notification: any) => Promise<void>) => {
			actionCallback = cb;
			return undefined;
		});

		await service.init();
		expect(actionCallback).not.toBeNull();

		await actionCallback!({
			actionId: 'dismiss_alarm',
			notification: {
				actionTypeId: 'upcoming_alarm',
				id: 1_000_009,
			},
		});

		expect(AlarmService.dismiss).toHaveBeenCalledWith(9);
	});

	it('dismisses upcoming actions when Android bridge payload is wrapped', async () => {
		const service = new AlarmManagerService();
		let actionCallback: ((notification: any) => Promise<void>) | null = null;

		(PlatformUtils.isMobile as any).mockReturnValue(true);
		(onAction as any).mockImplementation(async (cb: (notification: any) => Promise<void>) => {
			actionCallback = cb;
			return undefined;
		});

		await service.init();
		expect(actionCallback).not.toBeNull();

		await actionCallback!([
			{
				nameValuePairs: {
					actionId: 'dismiss_alarm',
					notification: {
						nameValuePairs: {
							actionTypeId: 'upcoming_alarm',
							id: 1_000_009,
						},
					},
				},
			},
		]);

		expect(AlarmService.dismiss).toHaveBeenCalledWith(9);
	});

	it('snoozes upcoming actions without stopping active ringing', async () => {
		const service = new AlarmManagerService();
		let actionCallback: ((notification: any) => Promise<void>) | null = null;

		(PlatformUtils.isMobile as any).mockReturnValue(true);
		(PlatformUtils.getPlatform as any).mockReturnValue('android');
		(onAction as any).mockImplementation(async (cb: (notification: any) => Promise<void>) => {
			actionCallback = cb;
			return undefined;
		});

		await service.init();
		expect(actionCallback).not.toBeNull();

		(invoke as any).mockClear();
		await actionCallback!({
			actionId: 'snooze_alarm',
			notification: {
				actionTypeId: 'upcoming_alarm',
				id: 1_000_011,
			},
		});

		expect(AlarmService.snooze).toHaveBeenCalledWith(11, 10);
		expect(invoke).not.toHaveBeenCalledWith('plugin:alarm-manager|stop_ringing');
		expect(showToast).toHaveBeenCalled();
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
				expect.objectContaining({
					id: 'upcoming_alarm',
					actions: expect.arrayContaining([
						expect.objectContaining({ id: 'snooze_alarm', title: 'Snooze (10m)' }),
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
				expect.objectContaining({
					id: 'upcoming_alarm',
					actions: expect.arrayContaining([
						expect.objectContaining({ id: 'snooze_alarm', title: 'Snooze (15m)' }),
					]),
				}),
			]),
		);
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

		(sendNotification as any).mockClear();
		const settingsChangedHandlers = eventListeners.get('settings-changed') ?? [];
		expect(settingsChangedHandlers.length).toBeGreaterThan(0);
		for (const handler of settingsChangedHandlers) {
			await handler({ payload: { key: 'is24h', value: true } });
		}

		expect(sendNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 1_000_021,
				actionTypeId: 'upcoming_alarm',
			}),
		);
	});
});
