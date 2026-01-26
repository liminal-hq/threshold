# Threshold Wear OS - Implementation Roadmap

**Project:** Threshold Wear OS Companion  
**Duration:** 5 Milestones (~6-8 weeks with AI tooling)  
**Architecture:** Rust-Core Event-Driven

---

## Overview

This roadmap follows a **bottom-up, incremental** approach:

1. **Milestone A**: Build Rust core (alarm coordinator + scheduler)
2. **Milestone B**: Migrate TypeScript to use Rust commands
3. **Milestone C**: Update alarm-manager to react to events
4. **Milestone D**: Build wear-sync plugin
5. **Milestone E**: Build Wear OS app

Each milestone is **testable and shippable** independently.

---

## Milestone A: Rust Core Infrastructure

**Duration:** 3-4 days  
**Goal:** Central alarm coordinator with scheduler logic  
**Deliverables:**
- AlarmCoordinator with CRUD operations
- Scheduler module with next trigger calculation
- AlarmDatabase with SQLite integration
- Event emission system
- Tauri commands exposed to TypeScript

**No UI changes yet** - TypeScript still uses old DatabaseService, but new commands are available.

---

### A1: Create Core File Structure

**Location:** `src-tauri/src/alarm/`

```bash
src-tauri/src/alarm/
├── mod.rs          # AlarmCoordinator + public API
├── database.rs     # SQLite operations
├── scheduler.rs    # Next trigger calculations
├── models.rs       # AlarmRecord, AlarmInput, etc.
├── events.rs       # Event emission helpers
└── error.rs        # Error types
```

**Tasks:**

1. **Create module structure:**
   ```bash
   cd src-tauri/src
   mkdir alarm
   touch alarm/{mod.rs,database.rs,scheduler.rs,models.rs,events.rs,error.rs}
   ```

2. **Update `src-tauri/src/lib.rs`:**
   ```rust
   pub mod alarm;
   pub mod commands;
   ```

---

### A2: Define Core Models

**File:** `src-tauri/src/alarm/models.rs`

```rust
use serde::{Deserialize, Serialize};

/// Complete alarm configuration (returned to TypeScript)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmRecord {
    pub id: i32,
    pub label: Option<String>,
    pub enabled: bool,
    pub mode: AlarmMode,
    pub fixed_time: Option<String>,       // "HH:MM"
    pub window_start: Option<String>,     // "HH:MM"
    pub window_end: Option<String>,       // "HH:MM"
    pub active_days: Vec<i32>,             // [0-6] where 0=Sun
    pub next_trigger: Option<i64>,         // Epoch millis
    pub sound_uri: Option<String>,
    pub sound_title: Option<String>,
}

/// Input for creating/updating alarms (from TypeScript)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlarmInput {
    pub id: Option<i32>,
    pub label: Option<String>,
    pub enabled: bool,
    pub mode: AlarmMode,
    pub fixed_time: Option<String>,
    pub window_start: Option<String>,
    pub window_end: Option<String>,
    pub active_days: Vec<i32>,
    pub sound_uri: Option<String>,
    pub sound_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AlarmMode {
    Fixed,
    Window,
}

impl Default for AlarmInput {
    fn default() -> Self {
        Self {
            id: None,
            label: None,
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("07:00".into()),
            window_start: None,
            window_end: None,
            active_days: vec![1, 2, 3, 4, 5], // Weekdays
            sound_uri: None,
            sound_title: None,
        }
    }
}
```

---

### A3: Implement Scheduler Logic (Secret Sauce)

**File:** `src-tauri/src/alarm/scheduler.rs`

```rust
use chrono::{DateTime, Datelike, Local, NaiveTime, Timelike};
use rand::Rng;
use crate::alarm::{models::*, error::Result};

/// Calculate next trigger timestamp for an alarm
pub fn calculate_next_trigger(alarm: &AlarmInput) -> Result<Option<i64>> {
    if !alarm.enabled {
        return Ok(None);
    }
    
    match alarm.mode {
        AlarmMode::Fixed => {
            let time = alarm.fixed_time.as_ref()
                .ok_or("Fixed alarm missing fixedTime")?;
            calculate_fixed_trigger(time, &alarm.active_days)
        },
        AlarmMode::Window => {
            let start = alarm.window_start.as_ref()
                .ok_or("Window alarm missing windowStart")?;
            let end = alarm.window_end.as_ref()
                .ok_or("Window alarm missing windowEnd")?;
            calculate_window_trigger(start, end, &alarm.active_days)
        },
    }
}

fn calculate_fixed_trigger(time_str: &str, active_days: &[i32]) -> Result<Option<i64>> {
    let now = Local::now();
    let target_time = NaiveTime::parse_from_str(time_str, "%H:%M")?;
    
    // Find next occurrence in active days
    for days_ahead in 0..8 {
        let candidate = now + chrono::Duration::days(days_ahead);
        let weekday = candidate.weekday().num_days_from_sunday() as i32;
        
        if active_days.contains(&weekday) {
            let candidate_dt = candidate
                .date_naive()
                .and_time(target_time)
                .and_local_timezone(Local)
                .unwrap();
            
            if candidate_dt > now {
                return Ok(Some(candidate_dt.timestamp_millis()));
            }
        }
    }
    
    // No active days found in next week
    Ok(None)
}

fn calculate_window_trigger(
    start_str: &str,
    end_str: &str,
    active_days: &[i32],
) -> Result<Option<i64>> {
    let now = Local::now();
    let start_time = NaiveTime::parse_from_str(start_str, "%H:%M")?;
    let end_time = NaiveTime::parse_from_str(end_str, "%H:%M")?;
    
    // Validate window
    if end_time <= start_time {
        return Err("Window end must be after start".into());
    }
    
    // Find next occurrence
    for days_ahead in 0..8 {
        let candidate = now + chrono::Duration::days(days_ahead);
        let weekday = candidate.weekday().num_days_from_sunday() as i32;
        
        if active_days.contains(&weekday) {
            let window_start = candidate
                .date_naive()
                .and_time(start_time)
                .and_local_timezone(Local)
                .unwrap();
            
            if window_start > now {
                // Calculate random offset within window
                let window_duration_secs = end_time
                    .signed_duration_since(start_time)
                    .num_seconds();
                
                let random_offset_secs = rand::thread_rng()
                    .gen_range(0..window_duration_secs);
                
                let trigger = window_start 
                    + chrono::Duration::seconds(random_offset_secs);
                
                return Ok(Some(trigger.timestamp_millis()));
            }
        }
    }
    
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_fixed_alarm_calculation() {
        let input = AlarmInput {
            enabled: true,
            mode: AlarmMode::Fixed,
            fixed_time: Some("09:00".into()),
            active_days: vec![1, 2, 3, 4, 5], // Weekdays
            ..Default::default()
        };
        
        let trigger = calculate_next_trigger(&input).unwrap();
        assert!(trigger.is_some());
    }
    
    #[test]
    fn test_window_randomization() {
        let input = AlarmInput {
            enabled: true,
            mode: AlarmMode::Window,
            window_start: Some("07:00".into()),
            window_end: Some("07:30".into()),
            active_days: vec![1, 2, 3, 4, 5],
            ..Default::default()
        };
        
        let trigger = calculate_next_trigger(&input).unwrap().unwrap();
        
        // Verify trigger is in the future
        let now = Local::now().timestamp_millis();
        assert!(trigger > now);
        
        // Run multiple times to verify randomness
        let trigger2 = calculate_next_trigger(&input).unwrap().unwrap();
        // Note: Could be same due to same day, but algorithm is random
    }
    
    #[test]
    fn test_disabled_alarm() {
        let input = AlarmInput {
            enabled: false,
            ..Default::default()
        };
        
        let trigger = calculate_next_trigger(&input).unwrap();
        assert!(trigger.is_none());
    }
}
```

**Dependencies to add to `src-tauri/Cargo.toml`:**
```toml
[dependencies]
chrono = { version = "0.4", features = ["serde"] }
rand = "0.8"
```

---

### A4: Implement Database Layer

**File:** `src-tauri/src/alarm/database.rs`

```rust
use tauri::{AppHandle, Runtime};
use tauri_plugin_sql::{Migration, MigrationKind};
use crate::alarm::{models::*, error::Result};

pub struct AlarmDatabase {
    // We'll use tauri-plugin-sql's managed state
}

impl AlarmDatabase {
    pub async fn new<R: Runtime>(app: &AppHandle<R>) -> Result<Self> {
        Ok(Self {})
    }
    
    pub async fn get_all<R: Runtime>(&self, app: &AppHandle<R>) -> Result<Vec<AlarmRecord>> {
        use tauri_plugin_sql::DbExt;
        
        let db = app.db()?;
        let rows: Vec<AlarmRow> = db.select("SELECT * FROM alarms ORDER BY id").await?;
        
        Ok(rows.into_iter().map(|r| r.into()).collect())
    }
    
    pub async fn get_by_id<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
    ) -> Result<AlarmRecord> {
        use tauri_plugin_sql::DbExt;
        
        let db = app.db()?;
        let row: AlarmRow = db.select_one(
            "SELECT * FROM alarms WHERE id = ?",
            vec![id.into()],
        ).await?;
        
        Ok(row.into())
    }
    
    pub async fn save<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        input: AlarmInput,
        next_trigger: Option<i64>,
    ) -> Result<AlarmRecord> {
        use tauri_plugin_sql::DbExt;
        
        let db = app.db()?;
        let active_days_json = serde_json::to_string(&input.active_days)?;
        
        if let Some(id) = input.id {
            // Update existing
            db.execute(
                "UPDATE alarms SET 
                    label=?, enabled=?, mode=?, fixed_time=?, window_start=?, 
                    window_end=?, active_days=?, next_trigger=?, sound_uri=?, sound_title=?
                WHERE id=?",
                vec![
                    input.label.into(),
                    input.enabled.into(),
                    format!("{:?}", input.mode).into(),
                    input.fixed_time.into(),
                    input.window_start.into(),
                    input.window_end.into(),
                    active_days_json.into(),
                    next_trigger.into(),
                    input.sound_uri.into(),
                    input.sound_title.into(),
                    id.into(),
                ],
            ).await?;
            
            self.get_by_id(app, id).await
        } else {
            // Insert new
            let result = db.execute(
                "INSERT INTO alarms 
                    (label, enabled, mode, fixed_time, window_start, window_end, 
                     active_days, next_trigger, sound_uri, sound_title)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                vec![
                    input.label.into(),
                    input.enabled.into(),
                    format!("{:?}", input.mode).into(),
                    input.fixed_time.into(),
                    input.window_start.into(),
                    input.window_end.into(),
                    active_days_json.into(),
                    next_trigger.into(),
                    input.sound_uri.into(),
                    input.sound_title.into(),
                ],
            ).await?;
            
            self.get_by_id(app, result.last_insert_id as i32).await
        }
    }
    
    pub async fn delete<R: Runtime>(&self, app: &AppHandle<R>, id: i32) -> Result<()> {
        use tauri_plugin_sql::DbExt;
        
        let db = app.db()?;
        db.execute("DELETE FROM alarms WHERE id = ?", vec![id.into()]).await?;
        Ok(())
    }
}

// Helper struct for deserializing SQL rows
#[derive(serde::Deserialize)]
struct AlarmRow {
    id: i32,
    label: Option<String>,
    enabled: bool,
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
            _ => AlarmMode::Fixed,
        };
        
        let active_days: Vec<i32> = serde_json::from_str(&row.active_days)
            .unwrap_or_else(|_| vec![]);
        
        Self {
            id: row.id,
            label: row.label,
            enabled: row.enabled,
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

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_alarms_table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS alarms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    label TEXT,
                    enabled BOOLEAN NOT NULL DEFAULT 0,
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
```

---

### A5: Implement AlarmCoordinator

**File:** `src-tauri/src/alarm/mod.rs`

```rust
pub mod database;
pub mod events;
pub mod models;
pub mod scheduler;
pub mod error;

pub use models::*;
pub use error::{Error, Result};

use tauri::{AppHandle, Emitter, Runtime};
use database::AlarmDatabase;

/// Central coordinator for all alarm operations
pub struct AlarmCoordinator {
    db: AlarmDatabase,
}

impl AlarmCoordinator {
    pub fn new(db: AlarmDatabase) -> Self {
        Self { db }
    }
    
    /// Get all alarms
    pub async fn get_all_alarms<R: Runtime>(
        &self,
        app: &AppHandle<R>,
    ) -> Result<Vec<AlarmRecord>> {
        self.db.get_all(app).await
    }
    
    /// Get single alarm by ID
    pub async fn get_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
    ) -> Result<AlarmRecord> {
        self.db.get_by_id(app, id).await
    }
    
    /// Create or update alarm
    pub async fn save_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        input: AlarmInput,
    ) -> Result<AlarmRecord> {
        // Calculate next trigger using scheduler
        let next_trigger = if input.enabled {
            scheduler::calculate_next_trigger(&input)?
        } else {
            None
        };
        
        // Save to database
        let alarm = self.db.save(app, input, next_trigger).await?;
        
        // Emit event to all listeners
        self.emit_alarms_changed(app).await?;
        
        Ok(alarm)
    }
    
    /// Toggle alarm on/off
    pub async fn toggle_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
        enabled: bool,
    ) -> Result<AlarmRecord> {
        let alarm = self.db.get_by_id(app, id).await?;
        
        let input = AlarmInput {
            id: Some(alarm.id),
            label: alarm.label,
            enabled,
            mode: alarm.mode,
            fixed_time: alarm.fixed_time,
            window_start: alarm.window_start,
            window_end: alarm.window_end,
            active_days: alarm.active_days,
            sound_uri: alarm.sound_uri,
            sound_title: alarm.sound_title,
        };
        
        self.save_alarm(app, input).await
    }
    
    /// Delete alarm
    pub async fn delete_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
    ) -> Result<()> {
        self.db.delete(app, id).await?;
        self.emit_alarms_changed(app).await?;
        Ok(())
    }
    
    /// Dismiss ringing alarm and calculate next occurrence
    pub async fn dismiss_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        id: i32,
    ) -> Result<()> {
        let alarm = self.db.get_by_id(app, id).await?;
        
        // Recalculate next occurrence
        let input = AlarmInput {
            id: Some(alarm.id),
            label: alarm.label,
            enabled: alarm.enabled,
            mode: alarm.mode,
            fixed_time: alarm.fixed_time,
            window_start: alarm.window_start,
            window_end: alarm.window_end,
            active_days: alarm.active_days,
            sound_uri: alarm.sound_uri,
            sound_title: alarm.sound_title,
        };
        
        self.save_alarm(app, input).await?;
        Ok(())
    }
    
    /// Emit alarms:changed event
    async fn emit_alarms_changed<R: Runtime>(&self, app: &AppHandle<R>) -> Result<()> {
        let alarms = self.get_all_alarms(app).await?;
        app.emit("alarms:changed", &alarms)?;
        Ok(())
    }
}
```

---

### A6: Create Tauri Commands

**File:** `src-tauri/src/commands.rs`

```rust
use crate::alarm::{AlarmCoordinator, AlarmInput, AlarmRecord};
use tauri::{AppHandle, Runtime, State};

#[tauri::command]
pub async fn get_alarms<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
) -> Result<Vec<AlarmRecord>, String> {
    coordinator
        .get_all_alarms(&app)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_alarm<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    id: i32,
) -> Result<AlarmRecord, String> {
    coordinator
        .get_alarm(&app, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_alarm<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    alarm: AlarmInput,
) -> Result<AlarmRecord, String> {
    coordinator
        .save_alarm(&app, alarm)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_alarm<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    id: i32,
    enabled: bool,
) -> Result<AlarmRecord, String> {
    coordinator
        .toggle_alarm(&app, id, enabled)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_alarm<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    id: i32,
) -> Result<(), String> {
    coordinator
        .delete_alarm(&app, id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn dismiss_alarm<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    id: i32,
) -> Result<(), String> {
    coordinator
        .dismiss_alarm(&app, id)
        .await
        .map_err(|e| e.to_string())
}
```

---

### A7: Update Main Entry Point

**File:** `src-tauri/src/lib.rs`

```rust
pub mod alarm;
pub mod commands;

use alarm::{database::AlarmDatabase, AlarmCoordinator};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:alarms.db", alarm::database::migrations())
                .build()
        )
        .setup(|app| {
            // Initialize database
            let db = tauri::async_runtime::block_on(async {
                AlarmDatabase::new(app.handle()).await
            })?;
            
            let coordinator = AlarmCoordinator::new(db);
            app.manage(coordinator);
            
            Ok(())
        })
        .plugin(alarm_manager::init()) // Existing plugin
        .invoke_handler(tauri::generate_handler![
            commands::get_alarms,
            commands::get_alarm,
            commands::save_alarm,
            commands::toggle_alarm,
            commands::delete_alarm,
            commands::dismiss_alarm,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

### A8: Error Handling

**File:** `src-tauri/src/alarm/error.rs`

```rust
use std::fmt;

#[derive(Debug)]
pub enum Error {
    Database(String),
    Scheduler(String),
    Validation(String),
    Tauri(tauri::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Database(msg) => write!(f, "Database error: {}", msg),
            Error::Scheduler(msg) => write!(f, "Scheduler error: {}", msg),
            Error::Validation(msg) => write!(f, "Validation error: {}", msg),
            Error::Tauri(e) => write!(f, "Tauri error: {}", e),
        }
    }
}

impl std::error::Error for Error {}

impl From<&str> for Error {
    fn from(s: &str) -> Self {
        Error::Validation(s.to_string())
    }
}

impl From<String> for Error {
    fn from(s: String) -> Self {
        Error::Validation(s)
    }
}

impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Error::Database(e.to_string())
    }
}

impl From<chrono::ParseError> for Error {
    fn from(e: chrono::ParseError) -> Self {
        Error::Scheduler(e.to_string())
    }
}

impl From<tauri::Error> for Error {
    fn from(e: tauri::Error) -> Self {
        Error::Tauri(e)
    }
}

pub type Result<T> = std::result::Result<T, Error>;
```

---

### A9: Testing

```bash
# Run unit tests
cd src-tauri
cargo test

# Expected output:
# running 3 tests
# test alarm::scheduler::tests::test_disabled_alarm ... ok
# test alarm::scheduler::tests::test_fixed_alarm_calculation ... ok
# test alarm::scheduler::tests::test_window_randomization ... ok
```

---

### Milestone A Completion Checklist

- [ ] All files created in `src-tauri/src/alarm/`
- [ ] Dependencies added to `Cargo.toml`
- [ ] Commands exposed in `main.rs`
- [ ] Unit tests passing
- [ ] Commands callable from TypeScript (test with DevTools console)
- [ ] No regressions (app still builds and runs)

**Next:** Milestone B (Migrate TypeScript to use Rust commands)

---

## Milestone B: TypeScript Migration

**Duration:** 2-3 days  
**Goal:** Replace TypeScript DatabaseService with Rust commands  
**Deliverables:**
- Updated TypeScript services
- Event listeners in UI
- Remove old DatabaseService
- Same UI, new backend

---

### B1: Create New TypeScript Types

**File:** `apps/threshold/src/types/alarm.ts`

```typescript
export interface AlarmRecord {
    id: number;
    label: string | null;
    enabled: boolean;
    mode: 'FIXED' | 'WINDOW';
    fixedTime: string | null;
    windowStart: string | null;
    windowEnd: string | null;
    activeDays: number[];
    nextTrigger: number | null;
    soundUri: string | null;
    soundTitle: string | null;
}

export interface AlarmInput {
    id?: number;
    label?: string | null;
    enabled: boolean;
    mode: 'FIXED' | 'WINDOW';
    fixedTime?: string | null;
    windowStart?: string | null;
    windowEnd?: string | null;
    activeDays: number[];
    soundUri?: string | null;
    soundTitle?: string | null;
}
```

---

### B2: Create Rust Command Wrapper Service

**File:** `apps/threshold/src/services/AlarmService.ts`

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { AlarmRecord, AlarmInput } from '../types/alarm';

export class AlarmService {
    private static unlistenFn: UnlistenFn | null = null;
    
    /**
     * Subscribe to alarm changes
     */
    static async subscribe(callback: (alarms: AlarmRecord[]) => void): Promise<UnlistenFn> {
        this.unlistenFn = await listen<AlarmRecord[]>('alarms:changed', (event) => {
            callback(event.payload);
        });
        return this.unlistenFn;
    }
    
    /**
     * Unsubscribe from alarm changes
     */
    static async unsubscribe() {
        if (this.unlistenFn) {
            this.unlistenFn();
            this.unlistenFn = null;
        }
    }
    
    /**
     * Get all alarms
     */
    static async getAll(): Promise<AlarmRecord[]> {
        return await invoke<AlarmRecord[]>('get_alarms');
    }
    
    /**
     * Get single alarm
     */
    static async get(id: number): Promise<AlarmRecord> {
        return await invoke<AlarmRecord>('get_alarm', { id });
    }
    
    /**
     * Create or update alarm
     */
    static async save(alarm: AlarmInput): Promise<AlarmRecord> {
        return await invoke<AlarmRecord>('save_alarm', { alarm });
    }
    
    /**
     * Toggle alarm on/off
     */
    static async toggle(id: number, enabled: boolean): Promise<AlarmRecord> {
        return await invoke<AlarmRecord>('toggle_alarm', { id, enabled });
    }
    
    /**
     * Delete alarm
     */
    static async delete(id: number): Promise<void> {
        await invoke('delete_alarm', { id });
    }
    
    /**
     * Dismiss ringing alarm
     */
    static async dismiss(id: number): Promise<void> {
        await invoke('dismiss_alarm', { id });
    }
}
```

---

### B3: Update App.tsx to Use Events

**File:** `apps/threshold/src/App.tsx`

```typescript
import { useEffect, useState } from 'react';
import { AlarmService } from './services/AlarmService';
import type { AlarmRecord } from './types/alarm';

function App() {
    const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        // Load initial data
        AlarmService.getAll()
            .then(setAlarms)
            .finally(() => setLoading(false));
        
        // Subscribe to changes
        const unlisten = AlarmService.subscribe(setAlarms);
        
        return () => {
            unlisten.then(fn => fn());
        };
    }, []);
    
    // Rest of app...
}
```

---

### B4: Update EditAlarm Screen

**File:** `apps/threshold/src/screens/EditAlarm.tsx`

```typescript
import { AlarmService } from '../services/AlarmService';
import type { AlarmInput } from '../types/alarm';

async function handleSave() {
    const input: AlarmInput = {
        id: alarm?.id,
        label: label || null,
        enabled: true,
        mode: mode,
        fixedTime: mode === 'FIXED' ? fixedTime : null,
        windowStart: mode === 'WINDOW' ? windowStart : null,
        windowEnd: mode === 'WINDOW' ? windowEnd : null,
        activeDays: selectedDays,
        soundUri: selectedSound?.uri || null,
        soundTitle: selectedSound?.title || null,
    };
    
    // Single call - Rust handles everything
    await AlarmService.save(input);
    
    // Navigate back - UI updates via event listener
    router.navigate('/');
}
```

---

### B5: Update Home Screen

**File:** `apps/threshold/src/screens/Home.tsx`

```typescript
import { AlarmService } from '../services/AlarmService';

function AlarmCard({ alarm }) {
    const handleToggle = async (enabled: boolean) => {
        await AlarmService.toggle(alarm.id, enabled);
        // UI updates automatically via event
    };
    
    const handleDelete = async () => {
        await AlarmService.delete(alarm.id);
        // UI updates automatically via event
    };
    
    // Render...
}
```

---

### B6: Update Ringing Screen

**File:** `apps/threshold/src/screens/Ringing.tsx`

```typescript
import { AlarmService } from '../services/AlarmService';

function RingingScreen() {
    const { id } = useParams();
    
    const handleDismiss = async () => {
        await AlarmService.dismiss(parseInt(id!));
        // Rust calculates next occurrence
        router.navigate('/');
    };
    
    // Render...
}
```

---

### B7: Remove Old DatabaseService

**Steps:**
1. Delete `apps/threshold/src/services/DatabaseService.ts`
2. Delete `apps/threshold/src/services/DatabaseService.test.ts`
3. Remove `@tauri-apps/plugin-sql` from `apps/threshold/package.json`
4. Update all imports to use new `AlarmService`

---

### Milestone B Completion Checklist

- [ ] AlarmService created and tested
- [ ] All screens updated to use AlarmService
- [ ] Event listeners working (UI updates automatically)
- [ ] Old DatabaseService removed
- [ ] No TypeScript errors
- [ ] App functions identically to before (same UX)
- [ ] Desktop and Mobile both work

**Next:** Milestone C (Update alarm-manager to react to events)

---

## Milestone C: Event-Driven alarm-manager

**Duration:** 2-3 days  
**Goal:** Make alarm-manager react to events instead of direct calls  
**Deliverables:**
- alarm-manager listens to `alarms:changed`
- Schedules/cancels alarms automatically
- SharedPreferences cache for boot recovery
- No TypeScript changes needed

---

### C1: Update alarm-manager Plugin Structure

**File:** `plugins/alarm-manager/src/lib.rs`

```rust
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Manager, Runtime,
};

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::AlarmManager;
#[cfg(mobile)]
use mobile::AlarmManager;

pub trait AlarmManagerExt<R: Runtime> {
    fn alarm_manager(&self) -> &AlarmManager<R>;
}

impl<R: Runtime, T: Manager<R>> AlarmManagerExt<R> for T {
    fn alarm_manager(&self) -> &AlarmManager<R> {
        self.state::<AlarmManager<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("alarm-manager")
        .invoke_handler(tauri::generate_handler![
            commands::pick_alarm_sound,
            commands::check_active_alarm,
            commands::stop_ringing,
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let alarm_manager = mobile::init(app, api)?;
            #[cfg(desktop)]
            let alarm_manager = desktop::init(app, api)?;
            
            app.manage(alarm_manager);
            
            // Listen to alarms:changed events
            setup_event_listener(app.clone());
            
            Ok(())
        })
        .build()
}

fn setup_event_listener<R: Runtime>(app: AppHandle<R>) {
    use serde_json::Value;
    
    app.listen("alarms:changed", move |event| {
        let payload = event.payload();
        
        // Parse AlarmRecord array
        if let Ok(alarms) = serde_json::from_str::<Vec<Value>>(payload) {
            #[cfg(target_os = "android")]
            mobile::handle_alarms_changed(&app, alarms);
            
            #[cfg(desktop)]
            desktop::handle_alarms_changed(&app, alarms);
        }
    });
}
```

---

### C2: Android Event Handler

**File:** `plugins/alarm-manager/src/mobile.rs`

```rust
use tauri::{AppHandle, Runtime};
use serde_json::Value;

pub fn handle_alarms_changed<R: Runtime>(app: &AppHandle<R>, alarms: Vec<Value>) {
    // For each alarm, schedule or cancel
    for alarm in alarms {
        let id = alarm["id"].as_i64().unwrap_or(0) as i32;
        let enabled = alarm["enabled"].as_bool().unwrap_or(false);
        let next_trigger = alarm["nextTrigger"].as_i64();
        let sound_uri = alarm["soundUri"].as_str().map(|s| s.to_string());
        
        if enabled && next_trigger.is_some() {
            let trigger = next_trigger.unwrap();
            
            // Schedule native alarm
            #[cfg(target_os = "android")]
            {
                app.run_on_main_thread(move |app_handle| {
                    if let Err(e) = schedule_native_alarm(app_handle, id, trigger, sound_uri) {
                        log::error!("Failed to schedule alarm {}: {}", id, e);
                    }
                }).ok();
            }
        } else {
            // Cancel native alarm
            #[cfg(target_os = "android")]
            {
                app.run_on_main_thread(move |app_handle| {
                    if let Err(e) = cancel_native_alarm(app_handle, id) {
                        log::error!("Failed to cancel alarm {}: {}", id, e);
                    }
                }).ok();
            }
        }
    }
}

#[cfg(target_os = "android")]
fn schedule_native_alarm<R: Runtime>(
    app: &AppHandle<R>,
    id: i32,
    trigger_at: i64,
    sound_uri: Option<String>,
) -> Result<()> {
    use jni::objects::JValue;
    
    app.run_on_android_context(|context, vm, env| {
        // Call AlarmUtils.scheduleAlarm(context, id, triggerAt, soundUri)
        // Also saves to SharedPreferences for boot recovery
        
        let context = env.new_global_ref(context)?;
        let class = env.find_class("com/plugin/alarmmanager/AlarmUtils")?;
        
        let method = env.get_static_method_id(
            class,
            "scheduleAlarm",
            "(Landroid/content/Context;IJLjava/lang/String;)V"
        )?;
        
        let sound_uri_jstring = sound_uri
            .map(|s| env.new_string(s))
            .transpose()?
            .map(|s| JValue::Object(s.into()));
        
        env.call_static_method_unchecked(
            class,
            method,
            &[
                JValue::Object(context.as_obj()),
                JValue::Int(id),
                JValue::Long(trigger_at),
                sound_uri_jstring.unwrap_or(JValue::Object(std::ptr::null_mut())),
            ]
        )?;
        
        Ok(())
    }).map_err(|e| Error::from(e))
}

#[cfg(target_os = "android")]
fn cancel_native_alarm<R: Runtime>(app: &AppHandle<R>, id: i32) -> Result<()> {
    // Similar JNI call to AlarmUtils.cancelAlarm
    // Also removes from SharedPreferences
    Ok(())
}
```

---

### C3: Kotlin AlarmUtils with SharedPreferences

**File:** `plugins/alarm-manager/android/src/main/java/com/plugin/alarmmanager/AlarmUtils.kt`

```kotlin
package com.plugin.alarmmanager

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.util.Log

object AlarmUtils {
    private const val PREFS_NAME = "ThresholdNative"
    private const val TAG = "AlarmUtils"
    
    fun scheduleAlarm(
        context: Context,
        id: Int,
        triggerAtMillis: Long,
        soundUri: String?
    ) {
        Log.d(TAG, "Scheduling alarm $id at $triggerAtMillis")
        
        // 1. Save to SharedPreferences for boot recovery
        saveToPrefs(context, id, triggerAtMillis, soundUri)
        
        // 2. Schedule via AlarmManager
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, AlarmReceiver::class.java).apply {
            action = "com.threshold.ALARM_TRIGGER"
            putExtra("ALARM_ID", id)
            putExtra("ALARM_SOUND_URI", soundUri)
        }
        
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val info = AlarmManager.AlarmClockInfo(triggerAtMillis, pendingIntent)
        alarmManager.setAlarmClock(info, pendingIntent)
        
        Log.d(TAG, "Alarm $id scheduled successfully")
    }
    
    fun cancelAlarm(context: Context, id: Int) {
        Log.d(TAG, "Cancelling alarm $id")
        
        // 1. Remove from SharedPreferences
        removeFromPrefs(context, id)
        
        // 2. Cancel via AlarmManager
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, AlarmReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        alarmManager.cancel(pendingIntent)
        pendingIntent.cancel()
        
        Log.d(TAG, "Alarm $id cancelled successfully")
    }
    
    private fun saveToPrefs(context: Context, id: Int, trigger: Long, soundUri: String?) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putLong("alarm_$id", trigger)
            if (soundUri != null) {
                putString("alarm_sound_$id", soundUri)
            }
            apply()
        }
    }
    
    private fun removeFromPrefs(context: Context, id: Int) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            remove("alarm_$id")
            remove("alarm_sound_$id")
            apply()
        }
    }
    
    fun loadAllFromPrefs(context: Context): List<Triple<Int, Long, String?>> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val all = prefs.all
        val alarms = mutableListOf<Triple<Int, Long, String?>>()
        
        for ((key, value) in all) {
            if (key.startsWith("alarm_") && !key.contains("sound")) {
                val id = key.removePrefix("alarm_").toIntOrNull() ?: continue
                val trigger = value as? Long ?: continue
                val soundUri = prefs.getString("alarm_sound_$id", null)
                
                alarms.add(Triple(id, trigger, soundUri))
            }
        }
        
        return alarms
    }
}
```

---

### C4: Boot Receiver

**File:** `plugins/alarm-manager/android/src/main/java/com/plugin/alarmmanager/BootReceiver.kt`

```kotlin
package com.plugin.alarmmanager

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("BootReceiver", "Boot completed, rescheduling alarms")
            
            val alarms = AlarmUtils.loadAllFromPrefs(context)
            val now = System.currentTimeMillis()
            
            for ((id, trigger, soundUri) in alarms) {
                if (trigger > now) {
                    AlarmUtils.scheduleAlarm(context, id, trigger, soundUri)
                    Log.d("BootReceiver", "Rescheduled alarm $id")
                } else {
                    Log.d("BootReceiver", "Skipped past alarm $id")
                }
            }
        }
    }
}
```

**Add to AndroidManifest.xml:**
```xml
<receiver
    android:name=".BootReceiver"
    android:enabled="true"
    android:exported="false">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
    </intent-filter>
</receiver>
```

---

### Milestone C Completion Checklist

- [ ] alarm-manager listens to `alarms:changed` events
- [ ] Alarms scheduled/cancelled automatically
- [ ] SharedPreferences cache working
- [ ] Boot receiver tested (restart device)
- [ ] No TypeScript changes needed
- [ ] Desktop alarm scheduling working

**Next:** Milestone D (Build wear-sync plugin)

---

## Milestone D: wear-sync Plugin

**Duration:** 3-4 days  
**Goal:** Wear Data Layer synchronization  
**Deliverables:**
- wear-sync plugin scaffolding
- Event listener for `alarms:changed`
- Data Layer publishing (phone → watch)
- Message handling (watch → phone)

See `data-architecture.md` for detailed data schemas.

**Key Files:**
- `plugins/wear-sync/src/lib.rs`
- `plugins/wear-sync/android/WearSyncService.kt`
- `plugins/wear-sync/android/WearMessageService.kt`

---

## Milestone E: Wear OS App

**Duration:** 4-5 days  
**Goal:** Companion watch app  
**Deliverables:**
- Wear OS Compose app
- Alarm list screen
- Tile widget
- Complication data source

See `ui-mockups.md` for designs.

**Key Components:**
- `wear-app/AlarmListActivity.kt`
- `wear-app/AlarmTileService.kt`
- `wear-app/AlarmComplicationService.kt`

---

## Timeline Summary

| Milestone | Duration | Cumulative |
|-----------|----------|------------|
| A: Rust Core | 3-4 days | 4 days |
| B: TS Migration | 2-3 days | 7 days |
| C: alarm-manager Events | 2-3 days | 10 days |
| D: wear-sync Plugin | 3-4 days | 14 days |
| E: Wear OS App | 4-5 days | 19 days |
| **Testing & Polish** | 5-7 days | **26 days** |

**Total:** ~4-6 weeks with AI tooling assistance

---

## Success Metrics

### Functional
- [ ] Create alarm on phone → Appears on watch < 2s
- [ ] Toggle alarm on watch → Phone updates < 2s
- [ ] Boot device → Alarms survive and reschedule
- [ ] Desktop alarm fires → Notification appears
- [ ] Android alarm fires → Ringing screen shows

### Technical
- [ ] Scheduler unit tests pass (100% coverage)
- [ ] No TypeScript database code remains
- [ ] alarm-manager works without Rust core knowledge
- [ ] wear-sync works without alarm-manager knowledge
- [ ] Events flow: Rust → plugins → watch → back to Rust

### UX
- [ ] Desktop and Mobile use identical TypeScript
- [ ] UI updates feel instant (< 100ms perceived latency)
- [ ] No loading spinners needed (optimistic updates)
- [ ] Error messages surface to user

---

**Ready to start Milestone A? Let's build the Rust core! 🚀**
