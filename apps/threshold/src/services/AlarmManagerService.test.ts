import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AlarmManagerService } from './AlarmManagerService';
import { AlarmMode } from '@threshold/core/types';
import { AlarmService } from './AlarmService';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';
import { sendNotification, registerActionTypes, onAction } from '@tauri-apps/plugin-notification';

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
}));

vi.mock('../utils/PlatformUtils', () => ({
	PlatformUtils: {
		isMobile: vi.fn().mockReturnValue(false),
	},
}));

describe('AlarmManagerService', () => {
	beforeEach(() => {
		vi.resetAllMocks();

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

		// @ts-ignore
		global.window = {
			...global.window,
			location: { pathname: '/' } as any,
		} as any;
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
});
