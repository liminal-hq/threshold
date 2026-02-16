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
	Schedule,
} from '@tauri-apps/plugin-notification';
import { PlatformUtils } from '../utils/PlatformUtils';

vi.mock('tauri-plugin-toast-api', () => ({
	showToast: vi.fn(),
}));

vi.mock('./AlarmService', () => ({
	AlarmService: {
		getAll: vi.fn(),
		snooze: vi.fn(),
	},
}));

vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
	listen: vi.fn(),
	emit: vi.fn(),
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

	beforeEach(() => {
		vi.resetAllMocks();
		localStorageState.clear();

		(AlarmService.getAll as any).mockResolvedValue([]);
		(AlarmService.snooze as any).mockResolvedValue(undefined);

		(listen as any).mockResolvedValue(undefined);
		(emit as any).mockResolvedValue(undefined);
		(invoke as any).mockImplementation((command: string) => {
			if (command === 'plugin:alarm-manager|get_launch_args') {
				return Promise.resolve({ imports: [] });
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

	it('snoozes alarms and stops the current ring', async () => {
		const service = new AlarmManagerService();

		await service.snoozeAlarm(42, 10);

		expect(AlarmService.snooze).toHaveBeenCalledWith(42, 10);
		expect(invoke).toHaveBeenCalledWith('plugin:alarm-manager|stop_ringing');
	});

	it('schedules upcoming notifications immediately when trigger is under 10 minutes away', async () => {
		const service = new AlarmManagerService();
		(PlatformUtils.isMobile as any).mockReturnValue(true);

		const now = 1_700_000_000_000;
		vi.spyOn(Date, 'now').mockReturnValue(now);

		await (service as any).scheduleUpcomingNotification(
			{
				id: 42,
				enabled: true,
				mode: AlarmMode.Fixed,
				label: 'Gym',
				fixedTime: '07:30',
				activeDays: [1],
			},
			now + 5 * 60 * 1000,
		);

		expect(cancel).toHaveBeenCalledWith([1_000_042]);
		expect(removeActive).toHaveBeenCalledWith([{ id: 1_000_042 }]);
		expect(sendNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 1_000_042,
				schedule: undefined,
			}),
		);
	});

	it('schedules upcoming notifications for 10 minutes before trigger when there is enough lead time', async () => {
		const service = new AlarmManagerService();
		(PlatformUtils.isMobile as any).mockReturnValue(true);

		const now = 1_700_000_000_000;
		const nextTrigger = now + 30 * 60 * 1000;
		vi.spyOn(Date, 'now').mockReturnValue(now);

		await (service as any).scheduleUpcomingNotification(
			{
				id: 7,
				enabled: true,
				mode: AlarmMode.RandomWindow,
				label: 'Focus',
				windowStart: '07:00',
				windowEnd: '08:00',
				activeDays: [1],
			},
			nextTrigger,
		);

		expect(Schedule.at).toHaveBeenCalledWith(new Date(nextTrigger - 10 * 60 * 1000), false, true);
		expect(sendNotification).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 1_000_007,
				title: expect.stringContaining('window'),
			}),
		);
	});

	it('routes upcoming dismiss actions to dismiss-next-occurrence handler', async () => {
		const service = new AlarmManagerService();
		(PlatformUtils.isMobile as any).mockReturnValue(true);
		let actionCallback: ((notification: any) => Promise<void>) | null = null;

		(onAction as any).mockImplementation(async (cb: (notification: any) => Promise<void>) => {
			actionCallback = cb;
			return undefined;
		});

		const dismissSpy = vi.spyOn(service as any, 'dismissNextOccurrence').mockResolvedValue(undefined);

		await service.init();
		expect(actionCallback).not.toBeNull();

		await actionCallback!({
			actionTypeId: 'upcoming_alarm',
			actionId: 'dismiss_alarm',
			id: 1_000_009,
		});

		expect(dismissSpy).toHaveBeenCalledWith(9);
	});

	it('routes upcoming snooze actions and shows toast confirmation', async () => {
		const service = new AlarmManagerService();
		(PlatformUtils.isMobile as any).mockReturnValue(true);
		let actionCallback: ((notification: any) => Promise<void>) | null = null;

		(onAction as any).mockImplementation(async (cb: (notification: any) => Promise<void>) => {
			actionCallback = cb;
			return undefined;
		});

		vi.spyOn(service as any, 'snoozeAlarm').mockResolvedValue(1_700_000_123_000);
		vi.spyOn(service, 'getAlarm').mockResolvedValue({
			id: 12,
			enabled: true,
			mode: AlarmMode.Fixed,
			label: 'Standup',
			fixedTime: '09:00',
			activeDays: [1],
		} as any);
		const toastSpy = vi.spyOn(service as any, 'showSnoozeToast').mockResolvedValue(undefined);

		await service.init();
		expect(actionCallback).not.toBeNull();

		await actionCallback!({
			actionTypeId: 'upcoming_alarm',
			actionId: 'snooze_alarm',
			id: 1_000_012,
		});

		expect((service as any).snoozeAlarm).toHaveBeenCalledWith(12, 10, false);
		expect(toastSpy).toHaveBeenCalled();
	});
});
