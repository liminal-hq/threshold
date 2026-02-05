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

    /// Atomically increment and return next revision.
    ///
    /// This uses a singleton table (`state_revision`) to maintain a global monotonic counter (logical clock).
    /// This is a standard pattern for synchronization systems to track state changes across the entire dataset,
    /// allowing clients (like the Wear OS app) to request "changes since revision X".
    ///
    /// The transaction ensures atomicity: no two operations can claim the same revision number.
    pub async fn next_revision(&self) -> Result<i64> {
        let mut tx = self.pool.begin().await?;

        // Atomic increment
        sqlx::query("UPDATE state_revision SET current_revision = current_revision + 1 WHERE id = 1")
            .execute(&mut *tx)
            .await?;

        // Fetch new value
        let (rev,): (i64,) = sqlx::query_as(
            "SELECT current_revision FROM state_revision WHERE id = 1"
        )
        .fetch_one(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(rev)
    }

    /// Get current revision without incrementing
    pub async fn current_revision(&self) -> Result<i64> {
        let (rev,): (i64,) = sqlx::query_as(
            "SELECT current_revision FROM state_revision WHERE id = 1"
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(rev)
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
        revision: i64,
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
                    window_end=?, active_days=?, next_trigger=?, sound_uri=?, sound_title=?,
                    revision=?
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
            .bind(revision)
            .bind(id)
            .execute(&self.pool)
            .await?;

            self.get_by_id(id).await
        } else {
            // Insert new
            let result = sqlx::query(
                "INSERT INTO alarms
                    (label, enabled, mode, fixed_time, window_start, window_end,
                     active_days, next_trigger, sound_uri, sound_title, revision)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
            .bind(revision)
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

    /// Delete alarm and create tombstone
    pub async fn delete_with_revision(&self, id: i32, revision: i64) -> Result<()> {
        let mut tx = self.pool.begin().await?;

        // Get label before deleting
        let label: Option<(Option<String>,)> = sqlx::query_as(
            "SELECT label FROM alarms WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;

        // Delete alarm
        sqlx::query("DELETE FROM alarms WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;

        // Create tombstone
        sqlx::query(
            "INSERT INTO alarm_tombstones (alarm_id, deleted_at_revision, deleted_at_timestamp, label)
             VALUES (?, ?, ?, ?)"
        )
        .bind(id)
        .bind(revision)
        .bind(chrono::Utc::now().timestamp_millis())
        .bind(label.and_then(|l| l.0))
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    /// Get alarms changed since revision (for incremental sync)
    pub async fn get_alarms_since_revision(&self, since: i64) -> Result<Vec<AlarmRecord>> {
        let rows = sqlx::query_as::<_, AlarmRow>(
            "SELECT * FROM alarms WHERE revision > ? ORDER BY id"
        )
        .bind(since)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Get deleted alarm IDs since revision (for incremental sync)
    pub async fn get_deleted_since_revision(&self, since: i64) -> Result<Vec<i32>> {
        let rows: Vec<(i32,)> = sqlx::query_as(
            "SELECT alarm_id FROM alarm_tombstones WHERE deleted_at_revision > ?"
        )
        .bind(since)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    /// Clean up old tombstones (time-based retention: 30 days)
    pub async fn cleanup_tombstones_older_than_days(&self, days: i64) -> Result<()> {
        let cutoff_timestamp = chrono::Utc::now()
            .checked_sub_signed(chrono::Duration::days(days))
            .unwrap()
            .timestamp_millis();

        sqlx::query("DELETE FROM alarm_tombstones WHERE deleted_at_timestamp < ?")
            .bind(cutoff_timestamp)
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
    revision: i64,
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
            revision: row.revision,
        }
    }
}

/// Returns database migrations for use with tauri-plugin-sql.
/// These should be registered during app setup using:
/// ```rust,ignore
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
                    enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
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
        Migration {
            version: 2,
            description: "add_revision_tracking",
            sql: r#"
                -- Global revision counter
                CREATE TABLE IF NOT EXISTS state_revision (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    current_revision INTEGER NOT NULL DEFAULT 0
                );
                INSERT INTO state_revision (id, current_revision) VALUES (1, 1);

                -- Add revision to alarms
                ALTER TABLE alarms ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;

                -- Tombstones for deleted alarms
                CREATE TABLE IF NOT EXISTS alarm_tombstones (
                    alarm_id INTEGER PRIMARY KEY,
                    deleted_at_revision INTEGER NOT NULL,
                    deleted_at_timestamp INTEGER NOT NULL,
                    label TEXT
                );

                -- Indexes for incremental sync
                CREATE INDEX IF NOT EXISTS idx_alarms_revision ON alarms(revision);
                CREATE INDEX IF NOT EXISTS idx_tombstones_revision ON alarm_tombstones(deleted_at_revision);
            "#,
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    /// Helper to create an in-memory test database with migrations applied
    async fn setup_test_db() -> AlarmDatabase {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("Failed to create in-memory database");

        // Run migrations
        for migration in migrations() {
            sqlx::query(migration.sql)
                .execute(&pool)
                .await
                .expect("Failed to run migrations");
        }

        AlarmDatabase { pool }
    }

    #[tokio::test]
    async fn test_save_new_alarm() {
        let db = setup_test_db().await;

        let input = AlarmInput {
            id: None,
            label: Some("Morning Alarm".to_string()),
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("07:00".to_string()),
            window_start: None,
            window_end: None,
            active_days: vec![1, 2, 3, 4, 5],
            sound_uri: None,
            sound_title: None,
        };

        let result = db.save(input.clone(), Some(1234567890), 1).await.unwrap();

        assert_eq!(result.id, 1); // First insert gets ID 1
        assert_eq!(result.label, Some("Morning Alarm".to_string()));
        assert_eq!(result.enabled, true);
        assert_eq!(result.mode, AlarmMode::Fixed);
        assert_eq!(result.fixed_time, Some("07:00".to_string()));
        assert_eq!(result.active_days, vec![1, 2, 3, 4, 5]);
        assert_eq!(result.next_trigger, Some(1234567890));
        assert_eq!(result.revision, 1);
    }

    #[tokio::test]
    async fn test_save_update_existing() {
        let db = setup_test_db().await;

        // Insert initial alarm
        let input = AlarmInput {
            id: None,
            label: Some("Original".to_string()),
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("07:00".to_string()),
            window_start: None,
            window_end: None,
            active_days: vec![1, 2, 3],
            sound_uri: None,
            sound_title: None,
        };
        let created = db.save(input, None, 1).await.unwrap();

        // Update the alarm
        let update_input = AlarmInput {
            id: Some(created.id),
            label: Some("Updated".to_string()),
            enabled: false,
            mode: AlarmMode::Window,
            fixed_time: None,
            window_start: Some("08:00".to_string()),
            window_end: Some("09:00".to_string()),
            active_days: vec![0, 6],
            sound_uri: Some("custom.mp3".to_string()),
            sound_title: Some("Custom Sound".to_string()),
        };
        let updated = db.save(update_input, Some(9876543210), 2).await.unwrap();

        assert_eq!(updated.id, created.id); // ID should remain the same
        assert_eq!(updated.label, Some("Updated".to_string()));
        assert_eq!(updated.enabled, false);
        assert_eq!(updated.mode, AlarmMode::Window);
        assert_eq!(updated.window_start, Some("08:00".to_string()));
        assert_eq!(updated.window_end, Some("09:00".to_string()));
        assert_eq!(updated.active_days, vec![0, 6]);
        assert_eq!(updated.sound_uri, Some("custom.mp3".to_string()));
        assert_eq!(updated.next_trigger, Some(9876543210));
        assert_eq!(updated.revision, 2);
    }

    #[tokio::test]
    async fn test_get_all_empty() {
        let db = setup_test_db().await;
        let alarms = db.get_all().await.unwrap();
        assert_eq!(alarms.len(), 0);
    }

    #[tokio::test]
    async fn test_get_all_multiple() {
        let db = setup_test_db().await;

        // Insert multiple alarms
        for i in 1..=3 {
            let input = AlarmInput {
                id: None,
                label: Some(format!("Alarm {}", i)),
                enabled: true,
                mode: AlarmMode::Fixed,
                fixed_time: Some("07:00".to_string()),
                window_start: None,
                window_end: None,
                active_days: vec![i],
                sound_uri: None,
                sound_title: None,
            };
            db.save(input, None, i as i64).await.unwrap();
        }

        let alarms = db.get_all().await.unwrap();
        assert_eq!(alarms.len(), 3);
        assert_eq!(alarms[0].label, Some("Alarm 1".to_string()));
        assert_eq!(alarms[1].label, Some("Alarm 2".to_string()));
        assert_eq!(alarms[2].label, Some("Alarm 3".to_string()));
    }

    #[tokio::test]
    async fn test_get_by_id_success() {
        let db = setup_test_db().await;

        let input = AlarmInput {
            id: None,
            label: Some("Test Alarm".to_string()),
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("07:00".to_string()),
            window_start: None,
            window_end: None,
            active_days: vec![1, 2, 3],
            sound_uri: None,
            sound_title: None,
        };
        let created = db.save(input, None, 1).await.unwrap();

        let fetched = db.get_by_id(created.id).await.unwrap();
        assert_eq!(fetched.id, created.id);
        assert_eq!(fetched.label, Some("Test Alarm".to_string()));
    }

    #[tokio::test]
    async fn test_get_by_id_not_found() {
        let db = setup_test_db().await;

        let result = db.get_by_id(999).await;
        assert!(result.is_err());
        
        if let Err(Error::Database(msg)) = result {
            assert!(msg.contains("not found"));
        } else {
            panic!("Expected Database error with 'not found' message");
        }
    }

    #[tokio::test]
    async fn test_delete_alarm() {
        let db = setup_test_db().await;

        // Create an alarm
        let input = AlarmInput {
            id: None,
            label: Some("To Delete".to_string()),
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("07:00".to_string()),
            window_start: None,
            window_end: None,
            active_days: vec![1],
            sound_uri: None,
            sound_title: None,
        };
        let created = db.save(input, None, 1).await.unwrap();

        // Delete it
        db.delete(created.id).await.unwrap();

        // Verify it's gone
        let result = db.get_by_id(created.id).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_boolean_conversion() {
        let db = setup_test_db().await;

        // Test enabled = true
        let input_enabled = AlarmInput {
            id: None,
            label: Some("Enabled".to_string()),
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("07:00".to_string()),
            window_start: None,
            window_end: None,
            active_days: vec![1],
            sound_uri: None,
            sound_title: None,
        };
        let enabled_alarm = db.save(input_enabled, None, 1).await.unwrap();
        assert_eq!(enabled_alarm.enabled, true);

        // Test enabled = false
        let input_disabled = AlarmInput {
            id: None,
            label: Some("Disabled".to_string()),
            enabled: false,
            mode: AlarmMode::Fixed,
            fixed_time: Some("07:00".to_string()),
            window_start: None,
            window_end: None,
            active_days: vec![1],
            sound_uri: None,
            sound_title: None,
        };
        let disabled_alarm = db.save(input_disabled, None, 2).await.unwrap();
        assert_eq!(disabled_alarm.enabled, false);

        // Verify by fetching
        let fetched_disabled = db.get_by_id(disabled_alarm.id).await.unwrap();
        assert_eq!(fetched_disabled.enabled, false);
    }

    #[tokio::test]
    async fn test_alarm_mode_serialization() {
        let db = setup_test_db().await;

        // Test FIXED mode
        let fixed_input = AlarmInput {
            id: None,
            label: Some("Fixed".to_string()),
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("07:00".to_string()),
            window_start: None,
            window_end: None,
            active_days: vec![1],
            sound_uri: None,
            sound_title: None,
        };
        let fixed_alarm = db.save(fixed_input, None, 1).await.unwrap();
        assert_eq!(fixed_alarm.mode, AlarmMode::Fixed);

        // Test WINDOW mode
        let window_input = AlarmInput {
            id: None,
            label: Some("Window".to_string()),
            enabled: true,
            mode: AlarmMode::Window,
            fixed_time: None,
            window_start: Some("07:00".to_string()),
            window_end: Some("08:00".to_string()),
            active_days: vec![1],
            sound_uri: None,
            sound_title: None,
        };
        let window_alarm = db.save(window_input, None, 2).await.unwrap();
        assert_eq!(window_alarm.mode, AlarmMode::Window);
    }

    #[tokio::test]
    async fn test_active_days_json_serialization() {
        let db = setup_test_db().await;

        let input = AlarmInput {
            id: None,
            label: Some("Test".to_string()),
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("07:00".to_string()),
            window_start: None,
            window_end: None,
            active_days: vec![0, 2, 4, 6],
            sound_uri: None,
            sound_title: None,
        };
        let alarm = db.save(input, None, 1).await.unwrap();
        
        assert_eq!(alarm.active_days, vec![0, 2, 4, 6]);

        // Verify by fetching
        let fetched = db.get_by_id(alarm.id).await.unwrap();
        assert_eq!(fetched.active_days, vec![0, 2, 4, 6]);
    }

    #[tokio::test]
    async fn test_empty_active_days() {
        let db = setup_test_db().await;

        let input = AlarmInput {
            id: None,
            label: Some("No Days".to_string()),
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("07:00".to_string()),
            window_start: None,
            window_end: None,
            active_days: vec![],
            sound_uri: None,
            sound_title: None,
        };
        let alarm = db.save(input, None, 1).await.unwrap();
        
        assert_eq!(alarm.active_days, Vec::<i32>::new());

        let fetched = db.get_by_id(alarm.id).await.unwrap();
        assert_eq!(fetched.active_days, Vec::<i32>::new());
    }

    #[tokio::test]
    async fn test_null_optional_fields() {
        let db = setup_test_db().await;

        let input = AlarmInput {
            id: None,
            label: None,
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("07:00".to_string()),
            window_start: None,
            window_end: None,
            active_days: vec![1],
            sound_uri: None,
            sound_title: None,
        };
        let alarm = db.save(input, None, 1).await.unwrap();
        
        assert_eq!(alarm.label, None);
        assert_eq!(alarm.sound_uri, None);
        assert_eq!(alarm.sound_title, None);
        assert_eq!(alarm.next_trigger, None);

        let fetched = db.get_by_id(alarm.id).await.unwrap();
        assert_eq!(fetched.label, None);
    }

    #[tokio::test]
    async fn test_invalid_alarm_mode_in_db() {
        let db = setup_test_db().await;

        // Manually insert an alarm with invalid mode
        sqlx::query(
            "INSERT INTO alarms (label, enabled, mode, active_days, revision) VALUES (?, ?, ?, ?, ?)"
        )
        .bind("Invalid Mode Test")
        .bind(1)
        .bind("INVALID_MODE")
        .bind("[]")
        .bind(1)
        .execute(&db.pool)
        .await
        .unwrap();

        // Fetch it - should default to FIXED and log warning
        let alarm = db.get_by_id(1).await.unwrap();
        assert_eq!(alarm.mode, AlarmMode::Fixed);
    }

    #[tokio::test]
    async fn test_invalid_json_active_days() {
        let db = setup_test_db().await;

        // Manually insert an alarm with invalid JSON
        sqlx::query(
            "INSERT INTO alarms (label, enabled, mode, active_days, revision) VALUES (?, ?, ?, ?, ?)"
        )
        .bind("Invalid JSON Test")
        .bind(1)
        .bind("FIXED")
        .bind("not valid json")
        .bind(1)
        .execute(&db.pool)
        .await
        .unwrap();

        // Fetch it - should default to empty array and log warning
        let alarm = db.get_by_id(1).await.unwrap();
        assert_eq!(alarm.active_days, Vec::<i32>::new());
    }

    #[tokio::test]
    async fn test_enabled_constraint() {
        let db = setup_test_db().await;

        // Try to insert with invalid enabled value (2)
        // Should fail due to CHECK(enabled IN (0, 1))
        let result = sqlx::query(
            "INSERT INTO alarms (label, enabled, mode, active_days, revision) VALUES (?, ?, ?, ?, ?)"
        )
        .bind("Constraint Test")
        .bind(2) // Invalid value
        .bind("FIXED")
        .bind("[]")
        .bind(1)
        .execute(&db.pool)
        .await;

        assert!(result.is_err());
        // Verify it's a constraint violation
        let err = result.unwrap_err();
        let msg = err.to_string();
        // SQLite constraint error message usually contains "CHECK constraint failed"
        assert!(msg.contains("CHECK constraint failed") || msg.contains("constraint"));
    }

    #[tokio::test]
    async fn test_revision_increments() {
        let db = setup_test_db().await;
        let rev1 = db.next_revision().await.unwrap();
        let rev2 = db.next_revision().await.unwrap();
        assert_eq!(rev2, rev1 + 1);
    }

    #[tokio::test]
    async fn test_alarm_stamped_with_revision() {
        let db = setup_test_db().await;
        let rev = db.next_revision().await.unwrap();
        let input = AlarmInput::default();
        let alarm = db.save(input, Some(123456), rev).await.unwrap();
        assert_eq!(alarm.revision, rev);
    }

    #[tokio::test]
    async fn test_incremental_sync() {
        let db = setup_test_db().await;

        let input1 = AlarmInput { label: Some("A".into()), ..Default::default() };
        let input2 = AlarmInput { label: Some("B".into()), ..Default::default() };

        let rev1 = db.next_revision().await.unwrap();
        db.save(input1, None, rev1).await.unwrap();

        let rev2 = db.next_revision().await.unwrap();
        db.save(input2, None, rev2).await.unwrap();

        // Get changes since rev 1
        let changed = db.get_alarms_since_revision(1).await.unwrap();
        assert_eq!(changed.len(), 1);
        assert_eq!(changed[0].revision, 2);
    }

    #[tokio::test]
    async fn test_delete_with_tombstone() {
        let db = setup_test_db().await;

        let input = AlarmInput { label: Some("To Delete".into()), ..Default::default() };
        let rev1 = db.next_revision().await.unwrap();
        let alarm = db.save(input, None, rev1).await.unwrap();

        let rev2 = db.next_revision().await.unwrap();
        db.delete_with_revision(alarm.id, rev2).await.unwrap();

        let deleted_ids = db.get_deleted_since_revision(rev1).await.unwrap();
        assert_eq!(deleted_ids.len(), 1);
        assert_eq!(deleted_ids[0], alarm.id);
    }
}
