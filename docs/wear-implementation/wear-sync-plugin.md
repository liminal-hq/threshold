# Wear OS Sync Plugin - Implementation Guide

**Status:** 🔴 BLOCKED - Waiting for Event System Implementation ([#112](https://github.com/liminal-hq/threshold/issues/112))

**Milestone:** D - Wear Sync Plugin
**Duration:** 3-4 days
**Prerequisites:** Event System (Milestone A.5) MUST be complete

## Overview

The `wear-sync` plugin synchronizes alarm data between the Threshold phone app and Wear OS companion watch using the Wear Data Layer. It implements an **incremental sync protocol with revision-based conflict detection** to ensure data consistency across devices while minimizing bandwidth and battery usage.

### Key Features

- **Batch Collector Pattern**: Debounces rapid alarm edits (500ms) to prevent watch spam
- **Incremental Sync**: Syncs only changes since last known revision
- **Conflict Detection**: Rejects stale watch updates using revision comparison
- **Tombstone Tracking**: Handles deleted alarms correctly across restarts
- **Efficient Payloads**: Uses granular events (40-220 bytes) instead of snapshots (1200 bytes)

### Architecture Position

```
┌─────────────────────────────────────────────────────────────┐
│                    Threshold Phone App                       │
│  ┌────────────────┐      ┌──────────────────────────────┐  │
│  │ AlarmCoordinator│──────│ Event Bus (Tauri)            │  │
│  │  - save_alarm  │      │  - alarm:created             │  │
│  │  - delete_alarm│      │  - alarm:updated             │  │
│  │  - toggle_alarm│      │  - alarm:scheduled           │  │
│  └────────────────┘      │  - alarms:batch:updated ✨   │  │
│           │               └──────────┬───────────────────┘  │
│           │                          │                       │
│           │               ┌──────────▼───────────────────┐  │
│           │               │ wear-sync Plugin             │  │
│           │               │  - Batch Collector (500ms)   │  │
│           │               │  - Data Layer Publisher      │  │
│           │               │  - Conflict Detector         │  │
│           │               └──────────┬───────────────────┘  │
│           │                          │                       │
│           └──────────────────────────┤                       │
│                                      │                       │
│                              ┌───────▼────────┐              │
│                              │ Wear Data Layer│              │
│                              │  /alarms path  │              │
│                              └───────┬────────┘              │
└──────────────────────────────────────┼──────────────────────┘
                                       │ Bluetooth
                               ┌───────▼────────┐
                               │  Wear OS Watch │
                               │  - DataClient  │
                               │  - MessageClient│
                               └────────────────┘
```

## Reference Documentation

This document focuses on implementation details. For architecture and protocol specification, see:

- **[event-architecture.md](event-architecture.md)** - Event system specification (sections 5-6 cover sync protocol)
- **[data-architecture.md](data-architecture.md)** - Data models and schemas
- **[flow-diagrams.md](flow-diagrams.md)** - Sequence diagrams for sync flows
- **[implementation-roadmap.md](implementation-roadmap.md)** - Milestone D step-by-step guide

---

## Table of Contents

1. [Plugin Structure](#plugin-structure)
2. [Batch Collector Pattern](#batch-collector-pattern)
3. [Event Listeners](#event-listeners)
4. [Incremental Sync Protocol](#incremental-sync-protocol)
5. [Conflict Detection](#conflict-detection)
6. [Data Layer Integration](#data-layer-integration)
7. [Command Interfaces](#command-interfaces)
8. [Testing Strategy](#testing-strategy)
9. [Performance Targets](#performance-targets)
10. [Troubleshooting](#troubleshooting)

---

## Plugin Structure

### File Organization

```
plugins/wear-sync/
├── src/
│   ├── lib.rs                 # Plugin entry point, initialization
│   ├── batch_collector.rs     # 500ms debounce buffer
│   ├── sync_protocol.rs       # Incremental sync logic
│   ├── conflict_detector.rs   # Revision comparison
│   ├── data_layer.rs          # Wear Data Layer integration
│   ├── commands.rs            # Tauri commands
│   └── error.rs               # Error types
├── Cargo.toml
└── README.md
```

### Dependencies

**Rust (Cargo.toml):**
```toml
[dependencies]
tauri = { version = "2.0", features = ["protocol-asset"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1.35", features = ["sync", "time"] }
log = "0.4"
thiserror = "1.0"

[build-dependencies]
tauri-plugin = { version = "2.0", features = ["build"] }
```

**Kotlin (android/build.gradle.kts):**
```kotlin
dependencies {
    implementation(project(":tauri-android"))
    implementation("com.google.android.gms:play-services-wearable:18.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.7.3")
}
```

### Plugin Registration

**File:** `apps/threshold/src-tauri/src/lib.rs`

```rust
use tauri::Manager;
use wear_sync::WearSyncPlugin;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(WearSyncPlugin::new())  // ← Register wear-sync plugin
        .plugin(alarm_manager::AlarmManagerPlugin::new())
        .setup(|app| {
            // ... existing setup ...
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## Batch Collector Pattern

### Problem Statement

Without batching, rapid alarm edits cause excessive watch syncs:

```
User edits alarm 5 times in 2 seconds
→ 5 separate watch syncs (inefficient, drains battery)
```

### Solution: Debounced Batch Collector

**File:** `plugins/wear-sync/src/batch_collector.rs`

```rust
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{Duration, Instant};

const DEBOUNCE_MS: u64 = 500;

pub struct BatchCollector {
    /// IDs of alarms changed since last sync
    pending_ids: Arc<Mutex<HashSet<i32>>>,
    /// Last revision processed
    last_revision: Arc<Mutex<i64>>,
    /// Timer handle for debounce
    timer_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl BatchCollector {
    pub fn new() -> Self {
        Self {
            pending_ids: Arc::new(Mutex::new(HashSet::new())),
            last_revision: Arc::new(Mutex::new(0)),
            timer_handle: Arc::new(Mutex::new(None)),
        }
    }

    /// Add alarm ID to pending batch and restart debounce timer
    pub async fn add(&self, id: i32, revision: i64) {
        let mut pending = self.pending_ids.lock().await;
        pending.insert(id);

        let mut last_rev = self.last_revision.lock().await;
        *last_rev = revision;

        // Cancel existing timer
        let mut timer = self.timer_handle.lock().await;
        if let Some(handle) = timer.take() {
            handle.abort();
        }

        // Start new debounce timer
        let pending_clone = self.pending_ids.clone();
        let revision_clone = self.last_revision.clone();
        let handle = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(DEBOUNCE_MS)).await;

            // Timer expired - trigger sync
            let mut pending = pending_clone.lock().await;
            let revision = *revision_clone.lock().await;

            if !pending.is_empty() {
                log::info!("Batch debounce expired - syncing {} alarms at revision {}",
                    pending.len(), revision);

                // TODO: Trigger actual Data Layer sync here
                // sync_to_watch(pending.drain().collect(), revision).await;

                pending.clear();
            }
        });

        *timer = Some(handle);
    }

    /// Force immediate sync (used on app pause/background)
    pub async fn flush(&self) -> Option<(Vec<i32>, i64)> {
        let mut pending = self.pending_ids.lock().await;
        let revision = *self.last_revision.lock().await;

        if pending.is_empty() {
            return None;
        }

        let ids: Vec<i32> = pending.drain().collect();
        log::info!("Flushing batch - {} alarms at revision {}", ids.len(), revision);

        Some((ids, revision))
    }
}
```

### Usage Flow

```
Event: alarms:batch:updated { updated_ids: [1, 2], revision: 42 }
  ↓
BatchCollector.add(1, 42)
BatchCollector.add(2, 42)
  ↓
Timer starts (500ms)
  ↓
[User edits alarm 3 within 500ms]
  ↓
Timer resets (500ms)
  ↓
[No more edits for 500ms]
  ↓
Timer expires → sync_to_watch([1, 2, 3], revision: 44)
```

---

## Event Listeners

### Subscribe to Granular Events

**File:** `plugins/wear-sync/src/lib.rs`

```rust
use tauri::{AppHandle, Emitter, Listener, Runtime};
use crate::batch_collector::BatchCollector;

pub struct WearSyncPlugin {
    batch_collector: Arc<BatchCollector>,
}

impl WearSyncPlugin {
    pub fn new() -> Self {
        Self {
            batch_collector: Arc::new(BatchCollector::new()),
        }
    }

    pub fn initialize<R: Runtime>(&self, app: &AppHandle<R>) -> Result<()> {
        let collector = self.batch_collector.clone();

        // Listen to batch update events
        app.listen("alarms:batch:updated", move |event| {
            let collector = collector.clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(payload) = serde_json::from_str::<AlarmsBatchUpdated>(event.payload()) {
                    for id in payload.updated_ids {
                        collector.add(id, payload.revision).await;
                    }
                }
            });
        });

        // Listen to sync needed events (explicit triggers)
        let collector2 = self.batch_collector.clone();
        app.listen("alarms:sync:needed", move |event| {
            let collector = collector2.clone();
            tauri::async_runtime::spawn(async move {
                if let Some((ids, revision)) = collector.flush().await {
                    // Force immediate sync
                    log::info!("Explicit sync requested - {} alarms", ids.len());
                    // sync_to_watch(ids, revision).await;
                }
            });
        });

        Ok(())
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AlarmsBatchUpdated {
    updated_ids: Vec<i32>,
    revision: i64,
    timestamp: i64,
}
```

### Event Categories to Monitor

| Event | Purpose | Action |
|-------|---------|--------|
| `alarms:batch:updated` | Debounced changes | Add IDs to batch collector |
| `alarms:sync:needed` | Force sync | Flush collector immediately |
| `alarm:deleted` | Deletion tracking | Send tombstone to watch |
| `alarm:scheduled` | Immediate scheduling | Optional: bypass batch for UX |

**Note:** We primarily listen to `alarms:batch:updated` instead of individual CRUD events to leverage the built-in debouncing from AlarmCoordinator.

---

## Incremental Sync Protocol

### Three Sync Response Types

See [event-architecture.md](event-architecture.md) section 6 for detailed specification.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SyncResponse {
    /// Watch is up to date
    UpToDate {
        current_revision: i64,
    },

    /// Send incremental changes
    Incremental {
        current_revision: i64,
        updated_alarms: Vec<AlarmRecord>,
        deleted_alarm_ids: Vec<i32>,
    },

    /// Send full snapshot
    FullSync {
        current_revision: i64,
        all_alarms: Vec<AlarmRecord>,
    },
}
```

### Sync Request Handler

**File:** `plugins/wear-sync/src/sync_protocol.rs`

```rust
use crate::alarm::{AlarmDatabase, AlarmRecord};

pub struct SyncProtocol {
    db: Arc<AlarmDatabase>,
}

impl SyncProtocol {
    /// Handle sync request from watch
    pub async fn sync_from_watch(&self, watch_revision: i64) -> Result<SyncResponse> {
        let current_revision = self.db.current_revision().await?;

        // Case 1: Watch is up to date
        if watch_revision == current_revision {
            log::info!("Watch at revision {} - up to date", watch_revision);
            return Ok(SyncResponse::UpToDate { current_revision });
        }

        // Case 2: Watch is ahead (conflict - force full sync)
        if watch_revision > current_revision {
            log::warn!("Watch revision {} > phone revision {} - forcing full sync",
                watch_revision, current_revision);
            let all_alarms = self.db.get_all_alarms().await?;
            return Ok(SyncResponse::FullSync {
                current_revision,
                all_alarms,
            });
        }

        // Case 3: Watch is behind
        let revision_gap = current_revision - watch_revision;

        // If gap is small, send incremental update
        if revision_gap <= 100 {
            log::info!("Watch behind by {} revisions - sending incremental",
                revision_gap);

            let updated_alarms = self.db
                .get_alarms_since_revision(watch_revision)
                .await?;

            let deleted_alarm_ids = self.db
                .get_deleted_since_revision(watch_revision)
                .await?;

            return Ok(SyncResponse::Incremental {
                current_revision,
                updated_alarms,
                deleted_alarm_ids,
            });
        }

        // If gap is large, send full sync to prevent huge payloads
        log::info!("Watch behind by {} revisions - sending full sync",
            revision_gap);
        let all_alarms = self.db.get_all_alarms().await?;
        Ok(SyncResponse::FullSync {
            current_revision,
            all_alarms,
        })
    }
}
```

### Revision Gap Thresholds

| Gap Size | Response Type | Reasoning |
|----------|---------------|-----------|
| 0 | UpToDate | No changes |
| 1-100 | Incremental | Efficient delta sync |
| 101+ | FullSync | Avoid huge payloads |
| Negative (watch ahead) | FullSync | Conflict - phone wins |

---

## Conflict Detection

### Problem: Stale Watch Updates

```
Phone: revision 50
Watch: revision 48 (stale)

Watch tries to update alarm → REJECT (stale data)
```

### Solution: Revision Comparison

**File:** `plugins/wear-sync/src/conflict_detector.rs`

```rust
use crate::alarm::{AlarmDatabase, AlarmInput, AlarmRecord};

pub struct ConflictDetector {
    db: Arc<AlarmDatabase>,
}

impl ConflictDetector {
    /// Save alarm from watch with conflict detection
    pub async fn save_alarm_from_watch(
        &self,
        input: AlarmInput,
        watch_revision: i64,
    ) -> Result<AlarmRecord> {
        let current_revision = self.db.current_revision().await?;

        // Check if watch is behind
        if watch_revision < current_revision {
            log::warn!("Rejecting stale watch update - watch at {}, phone at {}",
                watch_revision, current_revision);

            return Err(ConflictError::StaleUpdate {
                watch_revision,
                current_revision,
            }.into());
        }

        // If alarm exists, verify revision matches
        if let Some(alarm_id) = input.id {
            if let Ok(existing) = self.db.get_by_id(alarm_id).await {
                if existing.revision > watch_revision {
                    log::warn!("Rejecting stale alarm update - alarm at {}, watch at {}",
                        existing.revision, watch_revision);

                    return Err(ConflictError::AlarmModified {
                        alarm_id,
                        alarm_revision: existing.revision,
                        watch_revision,
                    }.into());
                }
            }
        }

        // No conflict - proceed with save
        log::info!("Watch update accepted - revision {}", watch_revision);

        // Get next revision and save
        let next_revision = self.db.next_revision().await?;
        let alarm = self.db.save(input, calculate_next_trigger(&input)?, next_revision).await?;

        // Events will be emitted by AlarmCoordinator
        Ok(alarm)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConflictError {
    #[error("Watch data is stale (watch: {watch_revision}, phone: {current_revision}). Sync required.")]
    StaleUpdate {
        watch_revision: i64,
        current_revision: i64,
    },

    #[error("Alarm {alarm_id} was modified (alarm: {alarm_revision}, watch: {watch_revision}). Sync required.")]
    AlarmModified {
        alarm_id: i32,
        alarm_revision: i64,
        watch_revision: i64,
    },
}
```

### Conflict Resolution Flow

```
Watch sends: save_alarm { id: 5, revision: 48, ... }
  ↓
Phone checks: current_revision = 50
  ↓
48 < 50? YES → REJECT with StaleUpdate error
  ↓
Watch receives error → triggers full sync
  ↓
Watch syncs to revision 50 → retries save
  ↓
Phone accepts update → revision 51
```

---

## Data Layer Integration

### Android Wear Data Layer API

The Wear Data Layer provides two communication channels:

1. **DataClient**: Synced key-value storage (phone ↔ watch)
2. **MessageClient**: One-way messages (commands, requests)

### Tauri Plugin Architecture

**No manual JNI needed** - Tauri automatically generates the Rust ↔ Kotlin bridge.

#### Architecture

```
┌─────────────────────────────────────────┐
│ Rust Commands (src/commands.rs)         │
│  - Tauri command definitions            │
│  - Business logic                       │
└──────────────┬──────────────────────────┘
               │ Tauri Auto-Generated Bridge
┌──────────────▼──────────────────────────┐
│ Kotlin Plugin (android/WearSyncPlugin)   │
│  - @TauriPlugin annotation              │
│  - DataClient integration               │
│  - MessageClient integration            │
└─────────────────────────────────────────┘
```

#### Rust Side: Command Definitions

**File:** `plugins/wear-sync/src/commands.rs`

```rust
use tauri::{AppHandle, Runtime, command};
use crate::sync_protocol::SyncResponse;

#[command]
pub async fn publish_to_watch<R: Runtime>(
    app: AppHandle<R>,
    alarms: Vec<AlarmRecord>,
    revision: i64,
) -> Result<(), String> {
    log::info!("Publishing {} alarms at revision {} to watch",
        alarms.len(), revision);

    // Tauri automatically bridges to Kotlin WearSyncPlugin.publishToWatch()
    // The actual Data Layer interaction happens in android/WearSyncPlugin.kt
    Ok(())
}

#[command]
pub async fn send_message_to_watch<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    data: Vec<u8>,
) -> Result<(), String> {
    log::debug!("Sending message to watch: {}", path);

    // Tauri bridges to Kotlin WearSyncPlugin.sendMessageToWatch()
    Ok(())
}
```

#### Kotlin Side: Data Layer Integration

**File:** `plugins/wear-sync/android/src/main/kotlin/com/liminal/threshold/wear_sync/WearSyncPlugin.kt`

```kotlin
package com.liminal.threshold.wear_sync

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke
import com.google.android.gms.wearable.*
import kotlinx.coroutines.*
import org.json.JSONObject

@TauriPlugin
class WearSyncPlugin(private val activity: Activity) : Plugin(activity) {
    private val dataClient: DataClient by lazy {
        Wearable.getDataClient(activity)
    }

    private val messageClient: MessageClient by lazy {
        Wearable.getMessageClient(activity)
    }

    @Command
    fun publishToWatch(invoke: Invoke) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val alarms = invoke.getArray("alarms")
                val revision = invoke.getLong("revision")

                val payload = JSONObject().apply {
                    put("revision", revision)
                    put("alarms", alarms)
                    put("timestamp", System.currentTimeMillis())
                }

                val putDataReq = PutDataMapRequest.create("/alarms").apply {
                    dataMap.putString("data", payload.toString())
                }.asPutDataRequest()

                val result = dataClient.putDataItem(putDataReq).await()

                android.util.Log.i("WearSync",
                    "Published ${alarms.length()} alarms at revision $revision")

                withContext(Dispatchers.Main) {
                    invoke.resolve(JSObject().apply {
                        put("success", true)
                        put("uri", result.uri.toString())
                    })
                }
            } catch (e: Exception) {
                android.util.Log.e("WearSync", "Failed to publish", e)
                withContext(Dispatchers.Main) {
                    invoke.reject("Failed to publish to watch: ${e.message}")
                }
            }
        }
    }

    @Command
    fun sendMessageToWatch(invoke: Invoke) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val path = invoke.getString("path") ?: "/sync_request"
                val data = invoke.getString("data")?.toByteArray() ?: ByteArray(0)

                // Get connected watch nodes
                val nodes = Wearable.getNodeClient(activity).connectedNodes.await()

                if (nodes.isEmpty()) {
                    withContext(Dispatchers.Main) {
                        invoke.reject("No connected watch found")
                    }
                    return@launch
                }

                messageClient.sendMessage(nodes.first().id, path, data).await()

                withContext(Dispatchers.Main) {
                    invoke.resolve()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    invoke.reject("Failed to send message: ${e.message}")
                }
            }
        }
    }
}
```

**Key Points:**
- ✅ **No JNI code needed** - Tauri handles the bridge automatically
- ✅ **@TauriPlugin annotation** - Marks the Kotlin class as a Tauri plugin
- ✅ **@Command annotation** - Exposes methods to Rust
- ✅ **Invoke object** - Provides parameter access and response handling
- ✅ **Coroutines** - Async operations with suspend functions

### Data Layer Paths

| Path | Direction | Content | Purpose |
|------|-----------|---------|---------|
| `/alarms` | Phone → Watch | `SyncResponse` JSON | Alarm data sync |
| `/sync_request` | Watch → Phone | `{ revision: i64 }` | Request sync |
| `/save_alarm` | Watch → Phone | `AlarmInput` + revision | Update from watch |
| `/delete_alarm` | Watch → Phone | `{ id: i32, revision: i64 }` | Delete from watch |

### Example: Publishing Alarms

```rust
// After batch collector flushes
let alarms = db.get_alarms_by_ids(&[1, 2, 3]).await?;
let revision = db.current_revision().await?;

data_layer_client.publish_alarms(alarms, revision).await?;
```

---

## Command Interfaces

### Tauri Commands for Watch Communication

**File:** `plugins/wear-sync/src/commands.rs`

```rust
use tauri::{AppHandle, Runtime, State};
use crate::sync_protocol::{SyncProtocol, SyncResponse};
use crate::conflict_detector::ConflictDetector;

/// Handle sync request from watch
#[tauri::command]
pub async fn sync_from_watch<R: Runtime>(
    app: AppHandle<R>,
    watch_revision: i64,
) -> Result<SyncResponse, String> {
    log::info!("Sync request from watch at revision {}", watch_revision);

    let sync_protocol = app.state::<SyncProtocol>();

    sync_protocol
        .sync_from_watch(watch_revision)
        .await
        .map_err(|e| format!("Sync failed: {}", e))
}

/// Save alarm from watch with conflict detection
#[tauri::command]
pub async fn save_alarm_from_watch<R: Runtime>(
    app: AppHandle<R>,
    input: AlarmInput,
    watch_revision: i64,
) -> Result<AlarmRecord, String> {
    log::info!("Save alarm from watch - revision {}", watch_revision);

    let conflict_detector = app.state::<ConflictDetector>();

    conflict_detector
        .save_alarm_from_watch(input, watch_revision)
        .await
        .map_err(|e| {
            log::warn!("Watch save rejected: {}", e);
            format!("Conflict: {}", e)
        })
}

/// Delete alarm from watch with conflict detection
#[tauri::command]
pub async fn delete_alarm_from_watch<R: Runtime>(
    app: AppHandle<R>,
    alarm_id: i32,
    watch_revision: i64,
) -> Result<(), String> {
    log::info!("Delete alarm {} from watch - revision {}", alarm_id, watch_revision);

    let conflict_detector = app.state::<ConflictDetector>();
    let db = app.state::<AlarmDatabase>();

    // Verify watch revision is current
    let current_revision = db.current_revision().await
        .map_err(|e| format!("Database error: {}", e))?;

    if watch_revision < current_revision {
        log::warn!("Rejecting stale delete - watch at {}, phone at {}",
            watch_revision, current_revision);
        return Err(format!(
            "Watch data is stale (watch: {}, phone: {}). Sync required.",
            watch_revision, current_revision
        ));
    }

    // Proceed with delete
    let next_revision = db.next_revision().await
        .map_err(|e| format!("Database error: {}", e))?;

    db.delete_with_revision(alarm_id, next_revision).await
        .map_err(|e| format!("Delete failed: {}", e))?;

    log::info!("Deleted alarm {} at revision {}", alarm_id, next_revision);
    Ok(())
}

/// Force immediate sync (called on app pause/background)
#[tauri::command]
pub async fn flush_pending_syncs<R: Runtime>(
    app: AppHandle<R>,
) -> Result<(), String> {
    log::info!("Flushing pending syncs");

    let batch_collector = app.state::<BatchCollector>();

    if let Some((ids, revision)) = batch_collector.flush().await {
        let db = app.state::<AlarmDatabase>();
        let data_layer = app.state::<DataLayerClient>();

        let alarms = db.get_alarms_by_ids(&ids).await
            .map_err(|e| format!("Database error: {}", e))?;

        data_layer.publish_alarms(alarms, revision).await
            .map_err(|e| format!("Publish failed: {}", e))?;
    }

    Ok(())
}
```

### Watch-Side Message Handlers (Kotlin)

```kotlin
// In Wear OS app
class AlarmSyncService : WearableListenerService() {
    override fun onMessageReceived(messageEvent: MessageEvent) {
        when (messageEvent.path) {
            "/alarms" -> {
                val syncResponse = Json.decodeFromString<SyncResponse>(
                    String(messageEvent.data)
                )
                handleSyncResponse(syncResponse)
            }
        }
    }

    private suspend fun requestSync() {
        val lastKnownRevision = prefs.getLong("last_sync_revision", 0)

        // Send message to phone via MessageClient
        messageClient.sendMessage(
            phoneNodeId,
            "/sync_request",
            """{"revision": $lastKnownRevision}""".toByteArray()
        ).await()
    }
}
```

---

## Testing Strategy

### Unit Tests

**File:** `plugins/wear-sync/src/batch_collector.rs`

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_batch_debounce() {
        let collector = BatchCollector::new();

        // Add 3 alarms rapidly
        collector.add(1, 10).await;
        collector.add(2, 11).await;
        collector.add(3, 12).await;

        // Should NOT trigger sync yet (within 500ms)
        tokio::time::sleep(Duration::from_millis(300)).await;

        // Add another - should reset timer
        collector.add(4, 13).await;

        // Wait for debounce to expire
        tokio::time::sleep(Duration::from_millis(600)).await;

        // All 4 alarms should be flushed
        let result = collector.flush().await;
        assert!(result.is_none()); // Already flushed by timer
    }

    #[tokio::test]
    async fn test_flush_immediate() {
        let collector = BatchCollector::new();

        collector.add(1, 10).await;
        collector.add(2, 11).await;

        // Force immediate flush
        let result = collector.flush().await;
        assert!(result.is_some());

        let (ids, revision) = result.unwrap();
        assert_eq!(ids.len(), 2);
        assert_eq!(revision, 11);
    }
}
```

### Integration Tests

**File:** `plugins/wear-sync/tests/sync_protocol_test.rs`

```rust
#[tokio::test]
async fn test_incremental_sync() {
    let db = create_test_db().await;
    let protocol = SyncProtocol::new(Arc::new(db));

    // Phone has 3 alarms at revision 3
    let alarm1 = create_test_alarm(1, 1).await;
    let alarm2 = create_test_alarm(2, 2).await;
    let alarm3 = create_test_alarm(3, 3).await;

    // Watch is at revision 1 (missing alarms 2 and 3)
    let response = protocol.sync_from_watch(1).await.unwrap();

    match response {
        SyncResponse::Incremental { updated_alarms, .. } => {
            assert_eq!(updated_alarms.len(), 2);
            assert_eq!(updated_alarms[0].id, 2);
            assert_eq!(updated_alarms[1].id, 3);
        }
        _ => panic!("Expected Incremental response"),
    }
}

#[tokio::test]
async fn test_conflict_detection() {
    let db = create_test_db().await;
    let detector = ConflictDetector::new(Arc::new(db));

    // Phone is at revision 50
    db.next_revision().await.unwrap(); // rev 1
    // ... (create 49 more revisions)

    // Watch tries to save with stale revision 48
    let input = AlarmInput { /* ... */ };
    let result = detector.save_alarm_from_watch(input, 48).await;

    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("stale"));
}

#[tokio::test]
async fn test_tombstone_sync() {
    let db = create_test_db().await;
    let protocol = SyncProtocol::new(Arc::new(db));

    // Create alarm at revision 1
    let alarm = create_test_alarm(1, 1).await;

    // Delete alarm at revision 2
    db.delete_with_revision(1, 2).await.unwrap();

    // Watch syncs from revision 1 (should get deletion)
    let response = protocol.sync_from_watch(1).await.unwrap();

    match response {
        SyncResponse::Incremental { deleted_alarm_ids, .. } => {
            assert_eq!(deleted_alarm_ids, vec![1]);
        }
        _ => panic!("Expected Incremental response"),
    }
}
```

### Manual Testing Scenarios

#### Scenario 1: Rapid Edits (Batch Debounce)

1. Open phone app
2. Edit alarm 5 times within 2 seconds
3. **Expected:** Only 1 watch sync after 500ms debounce
4. **Verify:** Check logs for "Batch debounce expired - syncing X alarms"

#### Scenario 2: Stale Watch Update (Conflict Detection)

1. Disconnect watch from phone
2. Edit alarm on phone (revision advances to 50)
3. Edit same alarm on watch (still at revision 48)
4. Reconnect watch
5. **Expected:** Watch edit rejected with "stale data" error
6. **Verify:** Watch triggers full sync, then retries edit successfully

#### Scenario 3: Deleted Alarm Resurrection (Tombstone)

1. Delete alarm on phone
2. Restart phone app (watch still has alarm)
3. Watch syncs
4. **Expected:** Watch receives tombstone, deletes alarm
5. **Verify:** Alarm does NOT reappear on phone after sync

#### Scenario 4: Watch Offline (Incremental Sync)

1. Disconnect watch for 1 hour
2. Create 10 alarms on phone (revisions 1-10)
3. Reconnect watch
4. **Expected:** Watch gets incremental update with 10 alarms (not full sync)
5. **Verify:** Check logs for "Incremental" response type

---

## Performance Targets

### Sync Latency

| Operation | Target | Acceptable | Unacceptable |
|-----------|--------|------------|--------------|
| Watch sync (< 10 alarms) | < 500ms | < 2s | > 5s |
| Watch sync (10-100 alarms) | < 2s | < 5s | > 10s |
| Incremental sync | < 500ms | < 1s | > 3s |
| Full sync | < 2s | < 5s | > 10s |
| Conflict detection | < 100ms | < 500ms | > 1s |

### Payload Sizes

| Sync Type | Typical Size | Max Acceptable |
|-----------|--------------|----------------|
| Incremental (1 alarm) | 220 bytes | 500 bytes |
| Incremental (10 alarms) | 2.2 KB | 5 KB |
| Full sync (100 alarms) | 22 KB | 50 KB |
| Batch event | 150 bytes | 300 bytes |

**Note:** Old snapshot approach sent 1200 bytes per event. Granular events reduce this by 85%.

### Battery Impact

- **Target:** < 1% battery drain per day from sync
- **Debounce benefit:** 5 edits → 1 sync = 80% reduction in wake locks
- **Incremental sync benefit:** 220 bytes vs 22 KB = 99% reduction in Bluetooth data

---

## Troubleshooting

### Problem: Watch Never Syncs

**Symptoms:**
- No logs showing "Batch debounce expired"
- Watch shows stale data

**Diagnosis:**
```bash
# Check if events are being emitted
pnpm tauri dev
# In browser console:
await window.__TAURI__.event.listen('alarms:batch:updated', (e) => console.log(e));
```

**Solution:**
- Verify Event System (Milestone A.5) is implemented
- Check AlarmCoordinator emits `alarms:batch:updated` events
- Verify BatchCollector is receiving events (check logs)

---

### Problem: Conflicts Always Rejected

**Symptoms:**
- Every watch edit fails with "stale data" error
- Watch stuck in sync loop

**Diagnosis:**
```bash
# Check current revision
await window.__TAURI__.core.invoke('get_alarms')
# All alarms should have same revision if no edits in progress
```

**Solution:**
- Ensure watch sends correct `watch_revision` parameter
- Verify phone increments revision correctly on save
- Check for clock skew (revision is monotonic, not timestamp-based)

---

### Problem: Deleted Alarms Reappear

**Symptoms:**
- Delete alarm on phone
- Restart app
- Alarm reappears

**Diagnosis:**
```bash
# Check tombstones table
sqlite3 threshold.db "SELECT * FROM alarm_tombstones;"
```

**Solution:**
- Verify `delete_with_revision()` creates tombstone
- Check watch implements tombstone handling
- Verify `get_deleted_since_revision()` returns correct IDs

---

### Problem: High Battery Drain

**Symptoms:**
- Watch battery drains > 5% per day
- Excessive Bluetooth activity

**Diagnosis:**
```bash
# Check sync frequency
adb logcat | grep "wear-sync"
# Should see < 10 syncs per hour during normal use
```

**Solution:**
- Verify batch debounce is working (500ms)
- Check for sync loops (watch → phone → watch)
- Ensure incremental sync is used (not full sync every time)

---

## Implementation Checklist

### Phase 1: Plugin Scaffolding (1 day)

- [ ] Create `plugins/wear-sync/` directory structure
- [ ] Set up Cargo.toml with dependencies
- [ ] Implement BatchCollector with 500ms debounce
- [ ] Register plugin in lib.rs
- [ ] Add event listeners for `alarms:batch:updated`
- [ ] Write unit tests for BatchCollector

### Phase 2: Sync Protocol (1 day)

- [ ] Implement SyncProtocol with 3 response types
- [ ] Add `sync_from_watch` Tauri command
- [ ] Implement ConflictDetector with revision checks
- [ ] Add `save_alarm_from_watch` command
- [ ] Add `delete_alarm_from_watch` command
- [ ] Write integration tests for sync scenarios

### Phase 3: Data Layer Integration (1 day)

- [ ] Set up JNI bridge to Android DataClient
- [ ] Implement `publish_alarms()` method
- [ ] Implement `send_message()` for commands
- [ ] Add error handling for Bluetooth disconnects
- [ ] Test Data Layer publishing manually

### Phase 4: Testing & Polish (0.5 days)

- [ ] Run manual testing scenarios (all 4)
- [ ] Verify performance targets (sync < 2s)
- [ ] Check battery drain (< 1% per day)
- [ ] Add logging for debugging
- [ ] Update README.md with usage instructions

### Phase 5: Documentation (0.5 days)

- [ ] Document Tauri command interfaces
- [ ] Add troubleshooting guide
- [ ] Create example watch-side code snippets
- [ ] Update main README.md with wear-sync overview

**Total Estimated Time:** 3-4 days

---

## Next Steps

1. **Complete Event System Implementation** ([#112](https://github.com/liminal-hq/threshold/issues/112))
   - This is the CRITICAL BLOCKER for starting Milestone D
   - Estimated: 10-12 hours

2. **Begin Plugin Scaffolding** (once #112 complete)
   - Follow Phase 1 checklist above
   - Set up BatchCollector and event listeners

3. **Implement Sync Protocol**
   - Follow Phase 2 checklist
   - Focus on conflict detection (critical for data integrity)

4. **Integrate Data Layer**
   - Follow Phase 3 checklist
   - Test on real Android device with paired watch

5. **Wear OS App Development** (Milestone E)
   - Implement watch UI
   - Add DataClient listeners
   - Handle sync responses

---

## References

- **[event-architecture.md](event-architecture.md)** - Authoritative event system specification
- **[implementation-roadmap.md](implementation-roadmap.md)** - Step-by-step implementation guide (Milestone D)
- **[data-architecture.md](data-architecture.md)** - Data models and sync protocol
- **[flow-diagrams.md](flow-diagrams.md)** - Visual sequence diagrams
- **GitHub Issue:** [#112 - Implement Event System](https://github.com/liminal-hq/threshold/issues/112)
- **Android Wear Docs:** [Data Layer API](https://developer.android.com/training/wearables/data-layer)
- **Tauri Docs:** [Plugin Development](https://tauri.app/v1/guides/building/plugins/)

---

**Ready to implement? Start with [#112](https://github.com/liminal-hq/threshold/issues/112) → then follow Phase 1 checklist above.** 🚀
