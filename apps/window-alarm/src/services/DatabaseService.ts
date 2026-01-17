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
		await this.migrate();
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
        next_trigger INTEGER,
        sound_uri TEXT,
        sound_title TEXT
      )
    `);
	}

	private async migrate() {
		try {
			// Check if sound_uri column exists
			const columns = await this.db!.select<any[]>('PRAGMA table_info(alarms)');
			const hasSoundUri = columns.some((c) => c.name === 'sound_uri');

			if (!hasSoundUri) {
				console.log('Migrating database: adding sound columns');
				await this.db!.execute('ALTER TABLE alarms ADD COLUMN sound_uri TEXT');
				await this.db!.execute('ALTER TABLE alarms ADD COLUMN sound_title TEXT');
			}
		} catch (e) {
			console.error('Migration failed', e);
		}
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
				`UPDATE alarms SET label=?, enabled=?, mode=?, fixed_time=?, window_start=?, window_end=?, active_days=?, next_trigger=?, sound_uri=?, sound_title=? WHERE id=?`,
				[
					alarm.label,
					alarm.enabled,
					alarm.mode,
					alarm.fixedTime,
					alarm.windowStart,
					alarm.windowEnd,
					daysJson,
					alarm.nextTrigger,
					alarm.soundUri ?? null,
					alarm.soundTitle ?? null,
					alarm.id,
				],
			);
			return alarm.id;
		} else {
			const result = await this.db!.execute(
				`INSERT INTO alarms (label, enabled, mode, fixed_time, window_start, window_end, active_days, next_trigger, sound_uri, sound_title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					alarm.label,
					alarm.enabled,
					alarm.mode,
					alarm.fixedTime,
					alarm.windowStart,
					alarm.windowEnd,
					daysJson,
					alarm.nextTrigger,
					alarm.soundUri ?? null,
					alarm.soundTitle ?? null,
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
			soundUri: row.sound_uri,
			soundTitle: row.sound_title,
		};
	}
}

export const databaseService = new DatabaseService();
