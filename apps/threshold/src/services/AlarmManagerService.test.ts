import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AlarmManagerService } from './AlarmManagerService';
import { databaseService } from './DatabaseService';
import { AlarmMode } from '@threshold/core/types';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { sendNotification, registerActionTypes, onAction } from '@tauri-apps/plugin-notification';

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
}));

vi.mock('../utils/PlatformUtils', () => ({
	PlatformUtils: {
		isMobile: vi.fn().mockReturnValue(false),
	},
}));

describe('AlarmManagerService', () => {
	beforeEach(() => {
		vi.resetAllMocks();

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

		// @ts-ignore
		global.window = {
			...global.window,
			location: { pathname: '/' } as any,
		} as any;
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
});
