# Threshold Wear OS - Data Architecture

**Version:** 2.0 (Rust-Core Architecture)
**Last Updated:** January 25, 2026
**Status:** Implementation Ready

> **📖 For Revision System & Sync Protocol:** See [event-architecture.md](event-architecture.md) sections 2 (Revision System Design) and 6 (Sync Protocol) for complete specifications including incremental sync, conflict detection, and tombstone handling.

---

## Overview

This document defines data models, storage strategies, and synchronization protocols for Threshold's Rust-core architecture with Wear OS support.

**Key Principles:**
- SQLite (via Rust) is the single source of truth
- Events propagate state changes to all listeners
- SharedPreferences provides boot recovery cache
- Wear Data Layer syncs read-only state to watch
- Last-write-wins for conflict resolution

---

## 1. Core Data Models

### 1.1 AlarmRecord (Rust ↔ TypeScript ↔ Kotlin)

**Purpose:** Complete alarm configuration shared across all layers

**Rust Definition:**
```rust
// src-tauri/src/alarm/models.rs
use serde::{Deserialize, Serialize};

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
    pub active_days: Vec<i32>,             // [0-6] where 0=Sunday
    pub next_trigger: Option<i64>,         // Epoch milliseconds
    pub sound_uri: Option<String>,         // content://...
    pub sound_title: Option<String>,       // "Argon"
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AlarmMode {
    Fixed,
    Window,
}
```

**TypeScript Definition:**
```typescript
// apps/threshold/src/types/alarm.ts
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
```

**Kotlin/JSON (Wear Sync):**
```kotlin
@Serializable
data class AlarmRecord(
    val id: Int,
    val label: String?,
    val enabled: Boolean,
    val mode: String,  // "FIXED" or "WINDOW"
    @SerialName("fixedTime") val fixedTime: String?,
    @SerialName("windowStart") val windowStart: String?,
    @SerialName("windowEnd") val windowEnd: String?,
    @SerialName("activeDays") val activeDays: List<Int>,
    @SerialName("nextTrigger") val nextTrigger: Long?,
    @SerialName("soundUri") val soundUri: String?,
    @SerialName("soundTitle") val soundTitle: String?
)
```

**JSON Example (Window Alarm):**
```json
{
  "id": 1,
  "label": "Wake Window",
  "enabled": true,
  "mode": "WINDOW",
  "fixedTime": null,
  "windowStart": "07:00",
  "windowEnd": "07:30",
  "activeDays": [1, 2, 3, 4, 5],
  "nextTrigger": 1737885420000,
  "soundUri": "content://media/internal/audio/media/28",
  "soundTitle": "Argon"
}
```

---

### 1.2 AlarmInput (TypeScript → Rust)

**Purpose:** Data structure for creating/updating alarms from UI

**Rust Definition:**
```rust
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
```

**TypeScript Definition:**
```typescript
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

**Note:** `next_trigger` is NOT in input - Rust calculates it.

---

### 1.3 AlarmState (Wear Data Layer Payload)

**Purpose:** Complete state snapshot published to watch

**Kotlin Definition:**
```kotlin
@Serializable
data class AlarmState(
    @SerialName("updatedAtMs") val updatedAtMs: Long,
    val alarms: List<AlarmRecord>
)
```

**JSON Example:**
```json
{
  "updatedAtMs": 1737885420000,
  "alarms": [
    {
      "id": 1,
      "label": "Morning",
      "enabled": true,
      "mode": "FIXED",
      "fixedTime": "07:00",
      "windowStart": null,
      "windowEnd": null,
      "activeDays": [1, 2, 3, 4, 5],
      "nextTrigger": 1737885420000,
      "soundUri": null,
      "soundTitle": null
    }
  ]
}
```

**Sorting:** Alarms sorted by `nextTrigger` ascending (earliest first), disabled alarms last.

---

## 2. Storage Architecture

### 2.1 SQLite Database (Source of Truth)

**Location:** `alarms.db` in app data directory

**Managed By:** Rust (`src-tauri/src/alarm/database.rs`)

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS alarms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT,
    enabled BOOLEAN NOT NULL DEFAULT 0,
    mode TEXT NOT NULL,
    fixed_time TEXT,
    window_start TEXT,
    window_end TEXT,
    active_days TEXT NOT NULL,  -- JSON array: "[1,2,3,4,5]"
    next_trigger INTEGER,        -- Epoch milliseconds
    sound_uri TEXT,
    sound_title TEXT
);
```

**Access Pattern:**
- **Rust:** Direct SQL queries via `tauri-plugin-sql`
- **TypeScript:** Via Rust commands (`get_alarms`, `save_alarm`, etc.)
- **Plugins:** Via `alarms:changed` events (read-only)

**Migrations:**
```rust
pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_alarms_table",
            sql: include_str!("../migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
```

---

### 2.2 SharedPreferences Cache (Android Boot Recovery)

**Location:** `ThresholdNative` preferences (Android only)

**Managed By:** `alarm-manager` plugin

**Purpose:** Survive device reboots when app isn't running

**Keys:**
```
alarm_1          → 1737885420000 (trigger timestamp)
alarm_sound_1    → "content://media/28" (optional)
alarm_2          → 1737892340000
alarm_sound_2    → null
```

**Write Trigger:** Whenever `alarms:changed` event fires

**Read Trigger:** `BootReceiver.onReceive()`

**Validation:** App re-syncs from SQLite on launch (cache could be stale)

---

### 2.3 Wear Data Layer (Watch State)

**Location:** `/threshold/state/alarms` DataItem

**Managed By:** `wear-sync` plugin

**Purpose:** Sync alarm state to watch

**Write Trigger:** Whenever `alarms:changed` event fires (Android only)

**Data Structure:**
```kotlin
PutDataMapRequest.create("/threshold/state/alarms").apply {
    dataMap.putString("state_json", alarmStateJson)
    dataMap.putLong("timestamp", System.currentTimeMillis())
}
```

**Persistence:** DataItems survive watch/phone restarts

**Size Limit:** 100 KB (typical payload ~5-10 KB for 20 alarms)

---

## 3. Event System

### 3.1 Event: `alarms:changed`

**Emitted By:** `AlarmCoordinator` (Rust)

**Payload:** `Vec<AlarmRecord>` serialized as JSON

**Listeners:**
- TypeScript UI (updates React state)
- alarm-manager plugin (schedules native alarms)
- wear-sync plugin (publishes to Data Layer)

**Example Emission:**
```rust
// src-tauri/src/alarm/mod.rs
impl AlarmCoordinator {
    async fn emit_alarms_changed<R: Runtime>(&self, app: &AppHandle<R>) -> Result<()> {
        let alarms = self.get_all_alarms(app).await?;
        app.emit("alarms:changed", &alarms)?;
        Ok(())
    }
}
```

**Example Listener (TypeScript):**
```typescript
useEffect(() => {
    const unlisten = listen<AlarmRecord[]>('alarms:changed', (event) => {
        setAlarms(event.payload);
    });
    return () => unlisten.then(fn => fn());
}, []);
```

**Example Listener (Rust Plugin):**
```rust
app.listen("alarms:changed", move |event| {
    let alarms: Vec<AlarmRecord> = serde_json::from_str(event.payload()).unwrap();
    handle_alarms_changed(&app, alarms);
});
```

---

## 4. Wear OS Data Synchronization

### 4.1 Phone → Watch (State Publishing)

**Protocol:** Wear Data Layer (DataClient API)

**Path:** `/threshold/state/alarms`

**Trigger:** `alarms:changed` event

**Flow:**
```
1. Rust emits `alarms:changed` event
2. wear-sync plugin receives event
3. Converts Vec<AlarmRecord> to AlarmState
4. Publishes to Data Layer
5. Watch receives DataItem within ~1-2 seconds
6. Watch updates UI
```

**Implementation:**
```kotlin
// plugins/wear-sync/android/WearSyncService.kt
fun publishState(alarms: List<AlarmRecord>) {
    val state = AlarmState(
        updatedAtMs = System.currentTimeMillis(),
        alarms = alarms.sortedBy { it.nextTrigger ?: Long.MAX_VALUE }
    )
    
    val json = Json.encodeToString(state)
    
    val request = PutDataMapRequest.create("/threshold/state/alarms").apply {
        dataMap.putString("state_json", json)
        dataMap.putLong("timestamp", state.updatedAtMs)
    }
    
    dataClient.putDataItem(request.asPutDataRequest())
}
```

---

### 4.2 Watch → Phone (Commands)

**Protocol:** Wear Message API (MessageClient)

**Paths:**
- `/threshold/cmd/alarm_set_enabled` - Toggle alarm
- `/threshold/cmd/alarm_delete` - Delete alarm
- `/threshold/cmd/alarm_create` (future) - Create alarm

**Trigger:** User action on watch

**Flow:**
```
1. User taps toggle on watch
2. Watch sends message to phone
3. wear-sync plugin receives message
4. Calls Rust command (e.g., `toggle_alarm`)
5. Rust updates SQLite
6. Rust emits `alarms:changed` event
7. wear-sync publishes updated state back to watch
8. Watch UI updates (roundtrip complete)
```

**Implementation (Toggle):**
```kotlin
// wear-app (watch side)
suspend fun toggleAlarm(id: Int, enabled: Boolean) {
    val payload = Json.encodeToString(mapOf(
        "id" to id,
        "enabled" to enabled
    ))
    
    val nodes = messageClient.connectedNodes.await()
    for (node in nodes) {
        messageClient.sendMessage(
            node.id,
            "/threshold/cmd/alarm_set_enabled",
            payload.toByteArray()
        ).await()
    }
}
```

```kotlin
// plugins/wear-sync/android (phone side)
override fun onMessageReceived(event: MessageEvent) {
    when (event.path) {
        "/threshold/cmd/alarm_set_enabled" -> {
            val data = Json.decodeFromString<Map<String, Any>>(
                event.data.decodeToString()
            )
            val id = (data["id"] as Number).toInt()
            val enabled = data["enabled"] as Boolean
            
            // Call Rust via invoke
            scope.launch {
                invoke("toggle_alarm", mapOf("id" to id, "enabled" to enabled))
            }
        }
    }
}
```

---

### 4.3 Conflict Resolution

**Strategy:** Last-write-wins with timestamp

**Problem:** User toggles alarm on watch while phone is offline, then phone comes back online.

**Solution:**
1. Add `updated_at_ms` field to `AlarmRecord` (future enhancement)
2. When processing Wear command, check timestamp:
   ```rust
   if wear_command.timestamp > alarm.updated_at_ms {
       // Apply change
   } else {
       // Ignore stale command
   }
   ```
3. For MVP, rely on eventual consistency (watch always accepts latest DataItem)

---

## 5. Data Flow Examples

### 5.1 Create Alarm (UI → Rust → Plugins → Watch)

```
┌─────────────┐
│  TypeScript │
│     UI      │
└──────┬──────┘
       │ invoke('save_alarm', input)
       ▼
┌─────────────────────────────────┐
│  Rust AlarmCoordinator          │
│  1. Validate input              │
│  2. Calculate next_trigger      │
│  3. Save to SQLite              │
│  4. Emit alarms:changed         │
└──────┬───────────────┬──────────┘
       │               │
       │               ▼
       │      ┌─────────────────┐
       │      │  wear-sync      │
       │      │  1. Receive evt │
       │      │  2. Publish to  │
       │      │     Data Layer  │
       │      └────────┬────────┘
       │               │
       ▼               ▼
┌─────────────┐  ┌──────────┐
│ alarm-mgr   │  │  Watch   │
│ 1. Recv evt │  │  UI      │
│ 2. Schedule │  │  updates │
│    native   │  └──────────┘
│ 3. Save to  │
│    SharedPr │
└─────────────┘
```

**Timeline:**
- T+0ms: User taps "Save"
- T+10ms: Rust saves to SQLite
- T+15ms: Event emitted
- T+20ms: alarm-manager schedules
- T+25ms: wear-sync publishes
- T+1000ms: Watch receives update

---

### 5.2 Toggle on Watch (Watch → Phone → Rust → Plugins)

```
┌──────────┐
│  Watch   │
│   UI     │
└────┬─────┘
     │ Send message
     ▼
┌─────────────────┐
│  wear-sync      │
│  (phone side)   │
└────┬────────────┘
     │ invoke('toggle_alarm')
     ▼
┌─────────────────────────────────┐
│  Rust AlarmCoordinator          │
│  1. Load alarm                  │
│  2. Update enabled field        │
│  3. Recalculate next_trigger    │
│  4. Save to SQLite              │
│  5. Emit alarms:changed         │
└──────┬───────────────┬──────────┘
       │               │
       ▼               ▼
┌─────────────┐  ┌─────────────┐
│ alarm-mgr   │  │  wear-sync  │
│ Cancel or   │  │  Publish    │
│ reschedule  │  │  updated    │
└─────────────┘  └──────┬──────┘
                        │
                        ▼
                   ┌──────────┐
                   │  Watch   │
                   │  UI      │
                   │  updates │
                   └──────────┘
```

**Timeline:**
- T+0ms: User taps toggle on watch
- T+50ms: Message queued
- T+500ms: Message reaches phone
- T+510ms: Rust updates SQLite
- T+515ms: Event emitted
- T+520ms: alarm-manager cancels
- T+525ms: wear-sync publishes
- T+1500ms: Watch receives update
- **Total roundtrip:** ~2 seconds

---

### 5.3 Boot Recovery (Android Only)

```
┌──────────────┐
│  Device      │
│  boots       │
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│  BootReceiver        │
│  1. Read SharedPrefs │
│  2. For each alarm:  │
│     if future        │
│       schedule it    │
└──────────────────────┘
       │
       │ (No Rust involvement)
       ▼
┌──────────────────┐
│  AlarmManager    │
│  alarms set      │
└──────────────────┘

Later, when app launches:
┌──────────────────────┐
│  App starts          │
│  1. Rust loads DB    │
│  2. Emits event      │
│  3. Plugins resync   │
└──────────────────────┘
```

**Why SharedPreferences?**
- BootReceiver can't launch app on some Android versions
- SharedPreferences survives boot
- Minimal data (id + timestamp + sound)
- Validated when app launches

---

## 6. Data Validation

### 6.1 Rust-Side Validation

```rust
impl AlarmCoordinator {
    pub async fn save_alarm<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        input: AlarmInput,
    ) -> Result<AlarmRecord> {
        // Validate mode-specific fields
        match input.mode {
            AlarmMode::Fixed => {
                if input.fixed_time.is_none() {
                    return Err("Fixed alarm requires fixedTime".into());
                }
            },
            AlarmMode::Window => {
                if input.window_start.is_none() || input.window_end.is_none() {
                    return Err("Window alarm requires windowStart and windowEnd".into());
                }
                
                // Validate window range
                let start = NaiveTime::parse_from_str(
                    input.window_start.as_ref().unwrap(),
                    "%H:%M"
                )?;
                let end = NaiveTime::parse_from_str(
                    input.window_end.as_ref().unwrap(),
                    "%H:%M"
                )?;
                
                if end <= start {
                    return Err("Window end must be after start".into());
                }
            }
        }
        
        // Validate active days
        if input.active_days.is_empty() {
            return Err("At least one day must be selected".into());
        }
        
        for day in &input.active_days {
            if *day < 0 || *day > 6 {
                return Err("Invalid day of week".into());
            }
        }
        
        // Proceed with save...
    }
}
```

---

### 6.2 TypeScript-Side Validation

```typescript
// apps/threshold/src/screens/EditAlarm.tsx
function validate(): string | null {
    if (mode === 'FIXED' && !fixedTime) {
        return 'Please select a time';
    }
    
    if (mode === 'WINDOW') {
        if (!windowStart || !windowEnd) {
            return 'Please select start and end times';
        }
        
        if (windowStart >= windowEnd) {
            return 'End time must be after start time';
        }
    }
    
    if (selectedDays.length === 0) {
        return 'Please select at least one day';
    }
    
    return null;
}
```

**Philosophy:** Validate in UI for UX, validate in Rust for security.

---

## 7. Performance Considerations

### 7.1 Event Emission Frequency

**Problem:** Emitting on every keystroke would spam listeners.

**Solution:** Debounce or only emit on save/toggle/delete.

```rust
// Only emit when user explicitly saves, not on intermediate changes
pub async fn save_alarm(...) {
    // ... save logic
    self.emit_alarms_changed(app).await?;  // ← Only here
}
```

---

### 7.2 Wear Sync Latency

**Target:** < 2 seconds roundtrip

**Measurement:**
```kotlin
// wear-sync plugin
val publishStart = System.currentTimeMillis()
publishToDataLayer(alarms)
Log.d(TAG, "Publish latency: ${System.currentTimeMillis() - publishStart}ms")
```

**Optimization:**
- Don't publish on every event (already done - event is coalesced)
- Use protobuf instead of JSON (future optimization)
- Compress large payloads (not needed for <20 alarms)

---

### 7.3 Database Query Performance

**Problem:** `get_all_alarms()` called frequently.

**Solution:** In-memory cache (future optimization).

```rust
pub struct AlarmCoordinator {
    db: AlarmDatabase,
    cache: Arc<RwLock<Option<Vec<AlarmRecord>>>>,  // Future
}
```

**For MVP:** Direct queries are fine (SQLite is fast for <100 rows).

---

## 8. Testing Data Flows

### 8.1 Unit Tests (Rust)

```rust
#[tokio::test]
async fn test_save_alarm_emits_event() {
    let app = /* create test app */;
    let coordinator = /* create coordinator */;
    
    let mut events_received = 0;
    app.listen("alarms:changed", move |_| {
        events_received += 1;
    });
    
    let input = AlarmInput {
        enabled: true,
        mode: AlarmMode::Fixed,
        fixed_time: Some("09:00".into()),
        active_days: vec![1, 2, 3, 4, 5],
        ..Default::default()
    };
    
    coordinator.save_alarm(&app, input).await.unwrap();
    
    assert_eq!(events_received, 1);
}
```

---

### 8.2 Integration Tests

**Scenario:** Create alarm on phone, verify watch receives update.

**Setup:**
1. Run phone app with wear-sync enabled
2. Run watch emulator paired to phone
3. Create alarm via UI
4. Check watch app receives DataItem within 2 seconds

**Verification:**
```kotlin
// Watch-side test
@Test
fun testReceiveAlarmUpdate() = runBlocking {
    val latch = CountDownLatch(1)
    
    dataClient.addListener { dataEvents ->
        for (event in dataEvents) {
            if (event.dataItem.uri.path == "/threshold/state/alarms") {
                latch.countDown()
            }
        }
    }
    
    // Trigger alarm creation on phone (via adb or manual)
    
    assertTrue(latch.await(5, TimeUnit.SECONDS))
}
```

---

## 9. Schema Evolution

### 9.1 Adding Fields

**Example:** Add `vibrate: Boolean` field

**Steps:**
1. Add to Rust model:
   ```rust
   pub struct AlarmRecord {
       // ... existing fields
       pub vibrate: bool,
   }
   ```

2. Create migration:
   ```sql
   ALTER TABLE alarms ADD COLUMN vibrate BOOLEAN DEFAULT 1;
   ```

3. Update TypeScript type:
   ```typescript
   interface AlarmRecord {
       // ... existing fields
       vibrate: boolean;
   }
   ```

4. Deploy - old data gets default value (`true`)

---

### 9.2 Removing Fields

**Example:** Remove `sound_title` (future optimization - fetch on demand)

**Steps:**
1. Mark as deprecated (keep in schema for 2 releases)
2. Update Rust to make optional:
   ```rust
   #[deprecated]
   pub sound_title: Option<String>,
   ```
3. After 2 releases, remove from all models
4. Create migration to drop column

---

## 10. Appendix: Complete Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                         TypeScript UI                         │
│                                                               │
│  invoke('save_alarm', input)                                 │
│                    ↓                                          │
│  listen('alarms:changed', callback)                          │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                    Rust AlarmCoordinator                      │
│                                                               │
│  1. Validate input                                           │
│  2. scheduler::calculate_next_trigger()  ← SECRET SAUCE      │
│  3. database.save(input, next_trigger)                       │
│  4. app.emit("alarms:changed", alarms)                       │
└─────────────┬────────────────────────┬───────────────────────┘
              │                        │
              │                        │
      ┌───────▼────────┐      ┌────────▼─────────┐
      │  alarm-manager │      │    wear-sync     │
      │                │      │                  │
      │  Android:      │      │  Android Only:   │
      │  • AlarmMgr    │      │  • Data Layer    │
      │  • SharedPrefs │      │  • Messages      │
      │                │      │                  │
      │  Desktop:      │      └────────┬─────────┘
      │  • Notifs      │               │
      └────────────────┘               │
                                       ▼
                              ┌────────────────┐
                              │  Wear OS App   │
                              │  • UI updates  │
                              │  • Tile update │
                              └────────────────┘
```

---

**This data architecture is production-ready. Proceed to implementation! 🚀**
