import Database from '@tauri-apps/plugin-sql';
import { Alarm, AlarmMode, DayOfWeek } from '@window-alarm/core/types';
export type { Alarm, AlarmMode, DayOfWeek };

const DB_NAME = 'alarms.db';

export class DatabaseService {
	private db: Database | null = null;

	async init() {
		if (this.db) return;
		this.db = await Database.load('sqlite:' + DB_NAME);
		await this.createTables();
	}

	private async createTables() {
		await this.db?.execute(`
      CREATE TABLE IF NOT EXISTS alarms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT,
        enabled BOOLEAN NOT NULL DEFAULT 0,
        mode TEXT NOT NULL,
        fixed_time TEXT,
        window_start TEXT,
        window_end TEXT,
        active_days TEXT,
        next_trigger INTEGER
      )
    `);
	}

	async getAllAlarms(): Promise<Alarm[]> {
		if (!this.db) await this.init();
		const rows = await this.db!.select<any[]>('SELECT * FROM alarms');
		return rows.map(this.mapRowToAlarm);
	}

	async saveAlarm(alarm: Omit<Alarm, 'id'> & { id?: number }): Promise<number> {
		if (!this.db) await this.init();
		const daysJson = JSON.stringify(alarm.activeDays);

		if (alarm.id) {
			await this.db!.execute(
				`UPDATE alarms SET label=?, enabled=?, mode=?, fixed_time=?, window_start=?, window_end=?, active_days=?, next_trigger=? WHERE id=?`,
				[
					alarm.label,
					alarm.enabled,
					alarm.mode,
					alarm.fixedTime,
					alarm.windowStart,
					alarm.windowEnd,
					daysJson,
					alarm.nextTrigger,
					alarm.id,
				],
			);
			return alarm.id;
		} else {
			const result = await this.db!.execute(
				`INSERT INTO alarms (label, enabled, mode, fixed_time, window_start, window_end, active_days, next_trigger) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					alarm.label,
					alarm.enabled,
					alarm.mode,
					alarm.fixedTime,
					alarm.windowStart,
					alarm.windowEnd,
					daysJson,
					alarm.nextTrigger,
				],
			);
			return result.lastInsertId as number;
		}
	}

	async deleteAlarm(id: number) {
		if (!this.db) await this.init();
		await this.db!.execute('DELETE FROM alarms WHERE id = ?', [id]);
	}

	private mapRowToAlarm(row: any): Alarm {
		return {
			id: row.id,
			label: row.label,
			enabled: Boolean(row.enabled),
			mode: row.mode as AlarmMode,
			fixedTime: row.fixed_time,
			windowStart: row.window_start,
			windowEnd: row.window_end,
			activeDays: JSON.parse(row.active_days || '[]') as DayOfWeek[],
			nextTrigger: row.next_trigger,
		};
	}
}

export const databaseService = new DatabaseService();
