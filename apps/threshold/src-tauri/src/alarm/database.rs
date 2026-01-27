use tauri::{AppHandle, Runtime, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};
use crate::alarm::{models::*, error::{Result, Error}};
use sqlx::sqlite::SqlitePool;

pub struct AlarmDatabase {
    pool: SqlitePool,
}

impl AlarmDatabase {
    pub async fn new<R: Runtime>(app: &AppHandle<R>) -> Result<Self> {
        let app_data_dir = app.path().app_data_dir()?;
        let db_path = app_data_dir.join("alarms.db");

        // Ensure directory exists (plugin usually handles this, but safe to check)
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(
                sqlx::sqlite::SqliteConnectOptions::new()
                    .filename(db_path)
                    .create_if_missing(true)
            )
            .await?;

        Ok(Self { pool })
    }

    pub async fn get_all(&self) -> Result<Vec<AlarmRecord>> {
        let rows = sqlx::query_as::<_, AlarmRow>("SELECT * FROM alarms ORDER BY id")
            .fetch_all(&self.pool)
            .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    pub async fn get_by_id(&self, id: i32) -> Result<AlarmRecord> {
        let row = sqlx::query_as::<_, AlarmRow>("SELECT * FROM alarms WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;

        let row = row.ok_or_else(|| Error::Database(format!("Alarm with id {} not found", id)))?;

        Ok(row.into())
    }

    pub async fn save(
        &self,
        input: AlarmInput,
        next_trigger: Option<i64>,
    ) -> Result<AlarmRecord> {
        let active_days_json = serde_json::to_string(&input.active_days)?;

        let mode_str = match input.mode {
            AlarmMode::Fixed => "FIXED",
            AlarmMode::Window => "WINDOW",
        };

        let enabled_int = if input.enabled { 1 } else { 0 };

        if let Some(id) = input.id {
            // Update existing
            sqlx::query(
                "UPDATE alarms SET
                    label=?, enabled=?, mode=?, fixed_time=?, window_start=?,
                    window_end=?, active_days=?, next_trigger=?, sound_uri=?, sound_title=?
                WHERE id=?"
            )
            .bind(input.label)
            .bind(enabled_int)
            .bind(mode_str)
            .bind(input.fixed_time)
            .bind(input.window_start)
            .bind(input.window_end)
            .bind(active_days_json)
            .bind(next_trigger)
            .bind(input.sound_uri)
            .bind(input.sound_title)
            .bind(id)
            .execute(&self.pool)
            .await?;

            self.get_by_id(id).await
        } else {
            // Insert new
            let result = sqlx::query(
                "INSERT INTO alarms
                    (label, enabled, mode, fixed_time, window_start, window_end,
                     active_days, next_trigger, sound_uri, sound_title)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(input.label)
            .bind(enabled_int)
            .bind(mode_str)
            .bind(input.fixed_time)
            .bind(input.window_start)
            .bind(input.window_end)
            .bind(active_days_json)
            .bind(next_trigger)
            .bind(input.sound_uri)
            .bind(input.sound_title)
            .execute(&self.pool)
            .await?;

            self.get_by_id(result.last_insert_rowid() as i32).await
        }
    }

    pub async fn delete(&self, id: i32) -> Result<()> {
        sqlx::query("DELETE FROM alarms WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

// Helper struct for deserializing SQL rows
#[derive(sqlx::FromRow)]
struct AlarmRow {
    id: i32,
    label: Option<String>,
    enabled: i32, // Read as integer to be safe
    mode: String,
    fixed_time: Option<String>,
    window_start: Option<String>,
    window_end: Option<String>,
    active_days: String,
    next_trigger: Option<i64>,
    sound_uri: Option<String>,
    sound_title: Option<String>,
}

impl From<AlarmRow> for AlarmRecord {
    fn from(row: AlarmRow) -> Self {
        let mode = match row.mode.as_str() {
            "FIXED" => AlarmMode::Fixed,
            "WINDOW" => AlarmMode::Window,
            _ => {
                log::warn!("Invalid alarm mode '{}' for alarm {}, defaulting to FIXED", row.mode, row.id);
                AlarmMode::Fixed
            }
        };

        let active_days: Vec<i32> = serde_json::from_str(&row.active_days)
            .unwrap_or_else(|e| {
                log::warn!("Failed to parse active_days for alarm {}: {}, using empty array", row.id, e);
                vec![]
            });

        Self {
            id: row.id,
            label: row.label,
            enabled: row.enabled != 0,
            mode,
            fixed_time: row.fixed_time,
            window_start: row.window_start,
            window_end: row.window_end,
            active_days,
            next_trigger: row.next_trigger,
            sound_uri: row.sound_uri,
            sound_title: row.sound_title,
        }
    }
}

/// Returns database migrations for use with tauri-plugin-sql.
/// These should be registered during app setup using:
/// ```rust
/// tauri::Builder::default()
///     .plugin(tauri_plugin_sql::Builder::default()
///         .add_migrations("sqlite:alarms.db", migrations())
///         .build())
/// ```
pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_alarms_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS alarms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    label TEXT,
                    enabled INTEGER NOT NULL DEFAULT 0,
                    mode TEXT NOT NULL,
                    fixed_time TEXT,
                    window_start TEXT,
                    window_end TEXT,
                    active_days TEXT NOT NULL,
                    next_trigger INTEGER,
                    sound_uri TEXT,
                    sound_title TEXT
                )
            "#,
            kind: MigrationKind::Up,
        },
    ]
}
