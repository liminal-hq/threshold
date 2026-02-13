import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AlarmManagerService } from './AlarmManagerService';
import { databaseService } from './DatabaseService';
import { AlarmMode } from '@threshold/core/types';
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

vi.mock('./DatabaseService', () => ({
	databaseService: {
		init: vi.fn(),
		getAllAlarms: vi.fn(),
		saveAlarm: vi.fn(),
		deleteAlarm: vi.fn(),
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

		(databaseService.init as any).mockResolvedValue(undefined);
		(databaseService.getAllAlarms as any).mockResolvedValue([]);
		(databaseService.saveAlarm as any).mockResolvedValue(1);

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

	it('marks alarms fired on ringing route initialisation', async () => {
		const service = new AlarmManagerService();
		const now = 1700000000000;
		vi.spyOn(Date, 'now').mockReturnValue(now);

		(databaseService.getAllAlarms as any).mockResolvedValue([
			{
				id: 12,
				enabled: false,
				mode: AlarmMode.Fixed,
				fixedTime: '07:30',
				activeDays: [1],
				label: 'Weekday alarm',
			},
		]);

		// @ts-ignore
		global.window.location = { pathname: '/ringing/12' } as any;

		await service.init();

		expect(databaseService.saveAlarm).toHaveBeenCalledTimes(1);
		const savedAlarm = (databaseService.saveAlarm as any).mock.calls[0][0];
		expect(savedAlarm.id).toBe(12);
		expect(savedAlarm.lastFiredAt).toBe(now);
	});

	it('rescheduleAll applies pending fired alarms before recalculating', async () => {
		const service = new AlarmManagerService();
		const pastTrigger = Date.now() - 1000;

		(databaseService.getAllAlarms as any).mockResolvedValue([
			{
				id: 7,
				enabled: true,
				mode: AlarmMode.Fixed,
				fixedTime: '06:45',
				activeDays: [1],
				nextTrigger: pastTrigger,
			},
		]);

		const saveSpy = vi.spyOn(service as any, 'saveAndSchedule').mockResolvedValue(7);
		(service as any).pendingFiredAlarm = { id: 7, firedAt: 555555 };

		await service.rescheduleAll();

		expect(saveSpy).toHaveBeenCalledTimes(1);
		const updatedAlarm = saveSpy.mock.calls[0][0] as { lastFiredAt?: number };
		expect(updatedAlarm.lastFiredAt).toBe(555555);
		expect((service as any).pendingFiredAlarm).toBe(null);
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
});
