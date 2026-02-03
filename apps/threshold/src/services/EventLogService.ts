import { invoke } from '@tauri-apps/api/core';
import { message, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';

const buildDefaultFileName = () => {
	const now = new Date();
	const pad = (value: number) => value.toString().padStart(2, '0');
	const stamp = [
		now.getFullYear(),
		pad(now.getMonth() + 1),
		pad(now.getDate()),
	].join('-');
	const time = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('-');
	return `threshold-event-logs-${stamp}_${time}.txt`;
};

export class EventLogService {
	async downloadEventLogs(): Promise<void> {
		const destination = await save({
			title: 'Save Event Logs',
			defaultPath: buildDefaultFileName(),
			filters: [{ name: 'Text', extensions: ['txt'] }],
		});

		if (!destination) {
			return;
		}

		try {
			const content = await invoke<string>('get_event_logs');
			await writeTextFile(destination, content);
			await message('Event logs saved. Send the file to the developer.', {
				title: 'Event Logs',
			});
		} catch (error) {
			console.error('Failed to export event logs:', error);
			await message('Unable to export event logs. Check the console for details.', {
				title: 'Event Logs',
				kind: 'error',
			});
		}
	}
}

export const eventLogService = new EventLogService();
