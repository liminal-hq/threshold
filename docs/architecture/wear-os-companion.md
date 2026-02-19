# Threshold — Wear OS Companion Architecture

**Version:** 1.0
**Last Updated:** February 17, 2026
**Status:** Design Complete — Implementation In Progress

---

## Overview

Threshold uses a **companion app architecture** for Wear OS: a native Kotlin watch app communicates with the Tauri phone app via Google's Wear Data Layer API. This is architecturally distinct from running Tauri on the watch — the watch app is a standalone native Android app that shares no runtime with the phone, communicating exclusively through IPC (DataItems and Messages).

This document covers:
1. How sync works when the phone app is running (normal path)
2. How sync works when the phone app is closed (offline path)
3. How watch-initiated writes reach the database (write-back path)
4. Design decisions and alternatives considered

**Key Principle:** SQLite remains the single source of truth, with all writes going through `AlarmCoordinator` in Rust. Kotlin services may *read* cached data but never write to the database directly.

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Wear OS Watch                                 │
│  apps/threshold-wear/                                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  AlarmRepository (in-memory)                             │   │
│  │  ← DataLayerListenerService (receives DataItems)         │   │
│  │  → WearDataLayerClient (sends Messages)                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  applicationId: ca.liminalhq.threshold                          │
│  namespace:     ca.liminalhq.threshold.wear                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Bluetooth / Wi-Fi (Wear Data Layer)
┌───────────────────────────┴─────────────────────────────────────┐
│                    Phone (Tauri Android App)                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  WearMessageService.kt (WearableListenerService)         │   │
│  │  Always available — GMS wakes process for messages       │   │
│  │  ┌─────────────────────────────────────────────────┐     │   │
│  │  │  Plugin loaded?                                  │     │   │
│  │  │  ├─ YES → route to WearSyncPlugin → Tauri events │     │   │
│  │  │  └─ NO  → sync: serve from SharedPreferences     │     │   │
│  │  │          → write: start WearSyncService (fg svc)  │     │   │
│  │  └─────────────────────────────────────────────────┘     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Tauri Runtime (when app is open)                        │   │
│  │  ┌────────────────┐    ┌──────────────────────────────┐  │   │
│  │  │ AlarmCoordinator│───→│ wear-sync plugin (Rust)      │  │   │
│  │  │  SQLite (sole   │    │  BatchCollector (500ms)      │  │   │
│  │  │   writer)       │    │  ChannelPublisher            │  │   │
│  │  └────────────────┘    │  SyncProtocol                │  │   │
│  │                         │  ConflictDetector            │  │   │
│  │                         └──────────┬───────────────────┘  │   │
│  │                                    │ Tauri bridge          │   │
│  │                         ┌──────────▼───────────────────┐  │   │
│  │                         │ WearSyncPlugin.kt            │  │   │
│  │                         │  DataClient (publish)        │  │   │
│  │                         │  → also caches to SharedPrefs│  │   │
│  │                         └──────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│  applicationId: ca.liminalhq.threshold                          │
└─────────────────────────────────────────────────────────────────┘
```

### Critical Constraint: Package Name

The Wear Data Layer routes messages using `applicationId`. Both the phone and watch apps **must** use the same `applicationId` (`ca.liminalhq.threshold`). The watch app uses a separate `namespace` (`ca.liminalhq.threshold.wear`) for Kotlin/R class generation.

---

## 2. Communication Protocols

### 2.1 DataClient (Phone → Watch)

**Purpose:** Persistent, synced state. Survives disconnects.

| Field | Description |
|-------|-------------|
| Path | `/threshold/alarms` |
| Format | `PutDataMapRequest` with `alarmsJson` (String) and `revision` (Long) |
| Payload | `SyncResponse` JSON (see §3) |
| Delivery | Automatic when Bluetooth reconnects |

### 2.2 MessageClient (Watch → Phone)

**Purpose:** Fire-and-forget commands. Requires active connection.

| Path | Payload | Handler |
|------|---------|---------|
| `/threshold/sync_request` | `"0"` (watch revision) | Triggers FullSync response |
| `/threshold/save_alarm` | `WatchSaveAlarm` JSON | Toggles alarm via coordinator |
| `/threshold/delete_alarm` | `WatchDeleteAlarm` JSON | Deletes alarm via coordinator |

---

## 3. Sync Protocol (SyncResponse)

The phone publishes a `SyncResponse` JSON payload to the watch via DataClient. The response type is determined by revision gap:

| Watch Revision vs Phone | Response Type | Payload |
|-------------------------|---------------|---------|
| Equal | `UpToDate` | `currentRevision` only |
| 1–100 behind | `Incremental` | `updatedAlarms` + `deletedAlarmIds` |
| >100 behind or ahead | `FullSync` | All `allAlarms` |

### JSON Format (as received by watch)

```json
{
  "type": "FullSync",
  "currentRevision": 42,
  "allAlarms": [
    {
      "id": 1,
      "label": "Morning",
      "enabled": true,
      "mode": "FIXED",
      "fixedTime": "07:00",
      "activeDays": [1, 2, 3, 4, 5],
      "nextTrigger": 1737885420000
    }
  ]
}
```

**Serde configuration (Rust):**
- Type tag: `#[serde(tag = "type", rename_all = "PascalCase")]` → produces `"FullSync"`, `"Incremental"`, `"UpToDate"`
- Field names: `#[serde(rename = "camelCase")]` per field → produces `"currentRevision"`, `"allAlarms"`, `"updatedAlarms"`, `"deletedAlarmIds"`

**Watch parser:** `DataLayerListenerService.processSyncPayload()` reads `root.optString("type")` and dispatches to the appropriate handler. Falls back to plain JSON array parsing for batch publishes.

### AlarmRecord → WatchAlarm Field Mapping

The phone's `AlarmRecord` (camelCase) is transformed by the watch's `WatchAlarm.fromJson()`:

| Phone Field | Watch Field | Transformation |
|-------------|-------------|----------------|
| `id` | `id` | Direct |
| `label` | `label` | Direct (nullable → empty string) |
| `enabled` | `enabled` | Direct |
| `fixedTime` | `hour`, `minute` | Split `"HH:MM"` string |
| `windowStart` | `hour`, `minute` | Fallback if `fixedTime` is null |
| `activeDays` | `daysOfWeek` | Rename only |

---

## 4. Three Operating Modes

### 4.1 Normal Path (App Running)

When the Tauri app is open and `WearSyncPlugin` is loaded:

```
AlarmCoordinator.save_alarm()
  → emits alarms:batch:updated
  → BatchCollector buffers 500ms
  → ChannelPublisher sends PublishCommand::Batch
  → spawn_publish_task emits wear:sync:batch_ready
  → App crate listener calls coordinator.emit_sync_needed(BatchComplete)
  → Fetches all alarms from DB, serializes to JSON
  → emits alarms:sync:needed (includes allAlarmsJson)
  → ChannelPublisher sends PublishCommand::Immediate
  → spawn_publish_task builds SyncResponse::FullSync
  → WearSync::publish_to_watch() → Kotlin bridge
  → WearSyncPlugin.publishToWatch()
    → DataClient.putDataItem() to /threshold/alarms
    → Also writes FullSync JSON to SharedPreferences cache
  → Watch DataLayerListenerService receives DataItem
```

For immediate syncs (app startup, force sync, reconnect):

```
AlarmCoordinator.emit_sync_needed(reason)
  → fetches all alarms from DB, serializes to JSON
  → emits alarms:sync:needed (includes allAlarmsJson)
  → handle_sync_needed() cancels any pending batch, then
  → ChannelPublisher sends PublishCommand::Immediate
  → spawn_publish_task builds SyncResponse::FullSync
  → publishes via Kotlin bridge
```

**All publishes produce FullSync payloads.** This is acceptable because alarm data is small (~200 bytes per alarm). Even 50 alarms would be ~12 KB, well under the 100 KB DataItem limit. The incremental sync protocol exists in code for future use but is not currently exercised.

### 4.2 Offline Read Path (App Closed, Watch Requests Sync)

When the watch sends a sync request and the Tauri runtime isn't loaded:

```
Watch sends /threshold/sync_request via MessageClient
  → GMS wakes phone process, delivers to WearMessageService
  → WearSyncPlugin.instance == null
  → Read cached FullSync JSON from SharedPreferences
  → Publish directly via DataClient (no Tauri needed)
  → Watch receives DataItem with cached alarm state
```

**SharedPreferences cache key:** `wear_sync_cache` in `ThresholdWearSync` preferences
- `cached_alarms_json`: The last FullSync SyncResponse JSON
- `cached_revision`: The revision at time of cache

**Cache freshness guarantee:** The cache is written on every publish (both batch and immediate). Since alarm changes can only happen through the app (which is running when changes occur), the cache is always consistent when the app closes.

**Edge case — empty cache:** On fresh install before the app has ever published, the cache is empty. `WearMessageService` logs the miss and drops the message. The watch will retry periodically, and the first app launch triggers an Initialize sync that populates the cache.

### 4.3 Offline Write Path (App Closed, Watch Sends Command)

When the watch sends a save/delete command and the Tauri runtime isn't loaded:

```
Watch sends /threshold/save_alarm via MessageClient
  → GMS wakes phone process, delivers to WearMessageService
  → WearSyncPlugin.instance == null
  → Persist message in WearSyncQueue (SharedPreferences)
  → Start WearSyncService (foreground service)
    → Shows brief "Syncing with watch..." notification
    → Boots Tauri runtime headlessly (~1 second to plugin ready)
    → WearSyncPlugin loads, sets instance
    → Waits for explicit watch pipeline readiness from Rust/app listeners
    → Drains WearSyncQueue and forwards messages via Channel
    → AlarmCoordinator processes the write
    → Events propagate: alarm-manager schedules, wear-sync publishes
    → WearSyncService stops itself
```

**Readiness handshake:** Queue drain is gated by both `setWatchMessageHandler` and `markWatchPipelineReady`. The app crate emits the ready signal after registering `wear:alarm:save`, `wear:alarm:delete`, and `wear:sync:request` listeners, preventing early-replay races during cold boot.

**Why a foreground service?**
- Android 12+ restricts background Activity launches
- A foreground service with notification is the sanctioned pattern
- Same pattern used by `AlarmRingingService` for alarm firing
- The Tauri runtime boots in ~1 second (observed from logcat)

**Why not direct DB writes from Kotlin?**
- Violates single-writer principle (revision conflicts, missing events)
- `AlarmCoordinator` handles scheduling, event emission, revision tracking
- SharedPreferences cache and alarm-manager cache would be stale
- Reconciliation on next app open would be complex and error-prone

---

## 5. SharedPreferences Usage

The project uses SharedPreferences as a persistent cache in two places:

| Preferences Name | Owner | Purpose |
|------------------|-------|---------|
| `ThresholdNative` | alarm-manager plugin | Boot recovery: trigger times + sound URIs |
| `ThresholdWearSync` | wear-sync plugin | Offline sync: cached FullSync JSON |

Both are **read-only caches** of data that lives in SQLite. They are written when events propagate and read when the Tauri runtime isn't available.

### Cache Lifecycle

```
App starts → heal-on-launch re-syncs alarm-manager SharedPrefs
           → emit_sync_needed publishes to watch + caches to wear-sync SharedPrefs

Alarm changes → AlarmCoordinator writes to SQLite
              → Events propagate to alarm-manager (updates SharedPrefs)
              → Events propagate to wear-sync (publishes + updates SharedPrefs)

App closes → SharedPrefs persist (survive process death and reboots)

Phone reboots → BootReceiver reads alarm-manager SharedPrefs, re-schedules
              → Watch sync request → WearMessageService reads wear-sync SharedPrefs

App reopens → heal-on-launch re-syncs everything from SQLite
```

---

## 6. Timing Analysis

From observed logcat (logcat-phone-7.log):

| Event | Timestamp | Delta |
|-------|-----------|-------|
| Watch sends sync_request | 23:57:54 | — |
| WearMessageService receives | 23:57:58 | +4s (GMS delivery) |
| Chromium webview init | 23:58:06 | +8s (user opened app) |
| WearSyncPlugin loaded | 23:58:07.013 | +0.1s |
| Published to watch | 23:58:07.106 | +0.1s |

**Key insight:** GMS message delivery takes ~3-4 seconds (Bluetooth latency). Tauri plugin init after process start is ~100ms. The 8-second gap was the user manually opening the app — with a foreground service this would be ~1 second instead.

**Expected offline write latency:** ~4-5 seconds total (3-4s GMS + 1s Tauri boot).

---

## 7. Comparison with Other Frameworks

| Framework | Wear OS Background Sync Pattern |
|-----------|---------------------------------|
| **Native Android** | WearableListenerService + Room DB direct access |
| **Flutter** | Native Kotlin WearableListenerService + platform channel bridge |
| **React Native** | Native Kotlin WearableListenerService + event emission to JS |
| **Capacitor** | Not supported |
| **Tauri (Threshold)** | Native Kotlin WearableListenerService + SharedPrefs cache (reads) + foreground service boot (writes) |

Threshold's approach is novel — no existing Tauri + Wear OS implementations exist. The hybrid pattern (cached reads + service-booted writes) avoids both direct DB access from Kotlin and the complexity of running Tauri headlessly for reads.

---

## 8. Design Decisions

### D1: PascalCase type tags in SyncResponse

**Decision:** Use `#[serde(rename_all = "PascalCase")]` for the `SyncResponse` enum type tag.

**Rationale:** The watch-side Kotlin parser uses `org.json.JSONObject` (not kotlinx.serialization), and matches type tags as `"FullSync"`, `"Incremental"`, `"UpToDate"`. PascalCase is the natural Kotlin enum naming convention.

**Alternative considered:** SCREAMING_SNAKE_CASE (`"FULL_SYNC"`) — rejected because it required updating the Kotlin parser and deviated from the existing watch code convention.

### D2: Alarm data carried in sync event, not fetched by publish task

**Decision:** The `alarms:sync:needed` event includes pre-serialized `allAlarmsJson` from the app crate. The wear-sync plugin passes this through to the publish task.

**Rationale:** The wear-sync plugin cannot import `AlarmCoordinator` (it's in the app crate, not a library). Rather than creating a circular dependency or a shared crate, the data flows through the event system — the coordinator fetches alarms and serializes them before emitting.

### D3: SharedPreferences for offline reads, foreground service for offline writes

**Decision:** Use cached data for the common case (sync requests) and boot the full runtime for the rare case (watch-initiated writes).

**Rationale:**
- Reads are the 90% case — watch boots, requests sync, gets cached data instantly
- Writes require the coordinator for revision tracking, event emission, and scheduling
- Direct DB writes from Kotlin would create consistency issues
- The ~1 second Tauri boot time is acceptable for writes (user is interacting with watch UI)
- Foreground service is the Android-sanctioned pattern for background work

### D4: Same applicationId for phone and watch

**Decision:** Both apps use `applicationId = "ca.liminalhq.threshold"`. The watch uses a separate `namespace` for code generation.

**Rationale:** The Wear Data Layer routes messages by applicationId. Different IDs prevent communication entirely. This was the root cause of the initial sync failure (watch used `ca.liminalhq.threshold.wear`).

---

## 9. Files Reference

### Phone-side (wear-sync plugin)

| File | Purpose |
|------|---------|
| `plugins/wear-sync/src/lib.rs` | Plugin entry, event listeners, message routing, publish task |
| `plugins/wear-sync/src/batch_collector.rs` | 500ms debounce buffer |
| `plugins/wear-sync/src/publisher.rs` | WearSyncPublisher trait + ChannelPublisher |
| `plugins/wear-sync/src/sync_protocol.rs` | SyncResponse enum, determine_sync_type() |
| `plugins/wear-sync/src/conflict_detector.rs` | Revision validation for watch updates |
| `plugins/wear-sync/src/models.rs` | Shared types (events, bridge requests, watch messages) |
| `plugins/wear-sync/src/mobile.rs` | Android bridge via Tauri PluginHandle |
| `plugins/wear-sync/src/desktop.rs` | No-op stubs for desktop compilation |
| `plugins/wear-sync/android/.../WearSyncPlugin.kt` | Kotlin @TauriPlugin with DataClient |
| `plugins/wear-sync/android/.../WearMessageService.kt` | WearableListenerService for incoming messages |
| `plugins/wear-sync/android/.../WearSyncService.kt` | Foreground service — boots Tauri for offline writes |
| `plugins/wear-sync/android/.../WearSyncCache.kt` | SharedPreferences helper for offline sync cache |

### Watch-side (threshold-wear app)

| File | Purpose |
|------|---------|
| `apps/threshold-wear/src/.../service/DataLayerListenerService.kt` | Receives DataItems, parses SyncResponse |
| `apps/threshold-wear/src/.../data/WearDataLayerClient.kt` | Sends Messages to phone |
| `apps/threshold-wear/src/.../data/WatchAlarm.kt` | Watch alarm model with JSON parsing |
| `apps/threshold-wear/src/.../data/AlarmRepository.kt` | In-memory alarm state |
| `apps/threshold-wear/build.gradle.kts` | applicationId = ca.liminalhq.threshold |

### App-side (alarm coordinator)

| File | Purpose |
|------|---------|
| `apps/threshold/src-tauri/src/lib.rs` | App setup — includes watch event listeners |
| `apps/threshold/src-tauri/src/alarm/mod.rs` | AlarmCoordinator (sole DB writer) |
| `apps/threshold/src-tauri/src/alarm/database.rs` | SQLite access, revision tracking |
| `apps/threshold/src-tauri/src/alarm/events.rs` | Event payload types including AlarmsSyncNeeded |
| `apps/threshold/src-tauri/src/alarm/models.rs` | AlarmRecord, AlarmInput |

---

## 10. Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| SyncResponse serde alignment | Done | PascalCase tags, camelCase fields |
| FullSync payload in all publishes | Done | Both batch and immediate paths send FullSync envelope |
| WatchAlarm.fromJson() AlarmRecord compat | Done | Parses fixedTime/activeDays |
| WearMessageService offline routing | Done | Cache reads + foreground service writes |
| SharedPreferences cache (reads) | Done | §4.2 — write on publish, read on offline sync |
| WearSyncService (foreground, writes) | Done | §4.3 — boots Tauri silently (no UI flash) |
| Watch event handlers in app crate | Done | wear:alarm:save/delete, wear:sync:request/batch_ready |
| heal-on-launch wear-sync integration | Done | emit_sync_needed(Initialize) on startup |

---

## Related Documents

- [data-architecture.md](data-architecture.md) — Data models and storage strategy
- [event-architecture.md](event-architecture.md) — Event system and revision protocol
- [../plugins/wear-sync.md](../plugins/wear-sync.md) — Plugin implementation details
- [../wear-implementation/README.md](../wear-implementation/README.md) — Watch app design and testing
- [../wear-implementation/testing-guide.md](../wear-implementation/testing-guide.md) — ADB, logcat, and e2e testing
