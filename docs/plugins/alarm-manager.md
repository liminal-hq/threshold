# Alarm Manager Plugin (`alarm-manager`)

**Plugin location:** `plugins/alarm-manager/`
**Status:** Active — Milestones A-C complete
**Platforms:** Android (native), Desktop (tokio fallback)

> This document describes the `alarm-manager` Tauri plugin, which bridges the Tauri webview to the native Android `AlarmManager` API. For plugin development patterns, see [Plugin Manifest Pattern](plugin-manifest-pattern.md). For the event system that drives this plugin, see [Event Architecture](../architecture/event-architecture.md).

## Overview

The alarm-manager plugin provides reliable, exact alarm scheduling on Android that wakes the device from Doze mode — something standard Web APIs cannot do. It includes:

1.  **Android Alarm Sound Picker**: Allowing users to select system alarm tones.
2.  **Per-Alarm Sound Persistence**: Storing the selected sound URI with the alarm.
3.  **Foreground Service Ringing**: Using a foreground service to play the alarm sound and vibrate, ensuring reliability and bypassing `NotificationChannel` sound limitations on modern Android.

## Data Contracts

### TypeScript (`packages/core/src/types.ts`)

The `Alarm` interface is extended to include sound information:

```typescript
export interface Alarm {
	// ... existing fields
	soundUri?: string | null; // content:// URI or null for Silent
	soundTitle?: string | null; // Human-readable title (e.g., "Argon")
}
```

### Picker Result

The `pickAlarmSound` function returns:

```typescript
export interface PickedAlarmSound {
	uri: string | null;
	isSilent: boolean;
	title: string | null;
}
```

### Frontend Services

#### `AlarmSoundPickerService` (`apps/threshold/src/services/AlarmSoundPickerService.ts`)

Wrapper around the plugin's `pickAlarmSound` command.

- `pickSound(currentUri?: string, title?: string)`: Invokes the native picker.
- Returns `Promise<PickedAlarmSound>`.

#### `AlarmSoundPicker` Component

UI component that uses `AlarmSoundPickerService` to display the current sound and allow users to change it.

### Rust Models (`plugins/alarm-manager/src/models.rs`)

The `ScheduleRequest` struct is extended:

```rust
pub struct ScheduleRequest {
    pub id: i32,
    pub trigger_at: i64,
    pub sound_uri: Option<String>, // camelCase: soundUri
}
```

### Kotlin Models

The Android plugin receives:

```kotlin
class ScheduleRequest {
    var id: Int = 0
    var triggerAt: Long = 0
    var soundUri: String? = null
}
```

## Storage

### Database (SQLite)

The `alarms` table in `alarms.db` is updated with new columns:

- `sound_uri` (TEXT, nullable)
- `sound_title` (TEXT, nullable)

**Migration Strategy**:
Schema migrations are handled by the Rust core (`AlarmDatabase`) at startup via the `sqlx` migration system.

### SharedPreferences (Android Native)

To support boot rescheduling and independent ringing, the native plugin stores alarm metadata in `SharedPreferences` ("ThresholdNative"):

- Key: `alarm_{id}` -> Value: `triggerAt` (Long)
- Key: `alarm_sound_{id}` -> Value: `soundUri` (String) [NEW]

## Scheduling Flows

### Current Architecture (Event-Driven)

The Rust core (`AlarmCoordinator`) is the single owner of scheduling. The plugin listens for events emitted by the coordinator and drives native scheduling accordingly.

1.  **Create/Update**:
    - UI calls `AlarmService.save()` → Rust `AlarmCoordinator` saves to SQLite, calculates `next_trigger`.
    - Coordinator emits `alarm:scheduled` event with `{ id, triggerAt, soundUri }`.
    - Plugin (Rust listener) receives event → calls into Kotlin via Tauri command bridge.
    - Kotlin: `AlarmUtils.scheduleAlarm` stores metadata in SharedPreferences and sets `AlarmManager` with a `PendingIntent` targeting `AlarmReceiver`.

2.  **Boot Reschedule**:
    - Kotlin: `BootReceiver` triggers on device boot.
    - Kotlin: Reads all `alarm_{id}` from SharedPreferences.
    - Kotlin: Retrieves corresponding `soundUri`.
    - Kotlin: Re-schedules valid future alarms via `AlarmManager`.

3.  **Cancel**:
    - Coordinator emits `alarm:cancelled` event with `{ id }`.
    - Plugin receives event → calls Kotlin `AlarmUtils.cancelAlarm`.
    - Kotlin: Cancels `PendingIntent` and removes entries from SharedPreferences.

> **Note:** The event system that drives these flows is defined in [event-architecture.md](../architecture/event-architecture.md). Once the Level 3 Granular Event System (issue #112) is implemented, this plugin will subscribe to `alarm:scheduled` and `alarm:cancelled` events with full revision tracking.

## Ringing Flows

### 1. Alarm Trigger

- System fires `PendingIntent` -> `AlarmReceiver.onReceive`.
- `AlarmReceiver` extracts `soundUri` from Intent extras (or looks up prefs).
- `AlarmReceiver` starts `AlarmRingingService` (Foreground Service) via `startForegroundService` (Android O+).

### 2. Foreground Service (`AlarmRingingService`)

- **On Start**:
  - Acquires WakeLock (partial).
  - Posts a high-priority **Foreground Notification** (channel `alarm_ringing_service`, silent sound).
  - Requests **Audio Focus** (`USAGE_ALARM`, `CONTENT_TYPE_SONIFICATION`).
  - Starts **MediaPlayer** with the `soundUri` (looping).
  - Starts **Vibration**.
- **Notification Actions**:
  - **Dismiss**: Sends `ACTION_DISMISS`, which stops the service and durably notifies Rust
    (`notifyAlarmDismissed`) via the native event bus — see Native Event Bus Integration
    below.
  - **Snooze**: Sends `ACTION_SNOOZE`, which stops the service and durably notifies Rust
    (`notifySnoozeRequested`) the same way; Rust computes the new snoozed-until time from
    `SnoozeLengthState` and reschedules.

### 3. Stop/Dismiss

- User taps "Dismiss" on notification OR opens app and taps "Stop".
- Service calls `stopSelf()`, releases WakeLock, abandons audio focus, stops player.

## Native Event Bus Integration

alarm-manager depends on the shared `plugins/native-bus` substrate (`tauri-plugin-native-bus`,
`implementation(project(":tauri-plugin-native-bus"))` in `android/build.gradle.kts`) for two
things: durable, guaranteed delivery of native events to Rust regardless of boot timing, and
an instant, Rust-independent fan-out to wear-sync for time-sensitive side effects. Full
detail — the topic table, the `handled_natively` tag mechanism and its documented
durability-first limitation, and `EventDedup`'s scope — lives in
[Event Architecture's Native Event Bus section](../architecture/event-architecture.md#native-event-bus-android-issue-255);
this section is the alarm-manager-specific summary.

- `AlarmReceiver` and `AlarmManagerPlugin` no longer hand-roll separate queues per event
  type. All four native event kinds this plugin produces --
  `alarm-manager:native-fired` (fired), `alarm-manager:snooze-requested`,
  `alarm-manager:dismiss-requested`, and `alarm-manager:import-requested` (from Android's
  `SET_ALARM` intent, see `SetAlarmActivity`) — are enqueued on one shared
  `DurableEventQueue` instance (`eventQueue(context)`), keyed by topic rather than by a
  separate queue class each. The plugin's four original hand-rolled queues were migrated
  onto this one-time, one-way (see the Gotchas entry in the root `CLAUDE.md`).
- Of those four, `native-fired`, `dismiss-requested`, and `snooze-requested` are _also_
  published on `NativeEventBus` (`publishToBus`) so wear-sync's own listeners
  (`NativeFiredListener`, `NativeStopListener`) can react before Rust has booted --
  `import-requested` is durably queued only, since nothing needs an instant native reaction
  to an alarm import.
- `WatchStopInitProvider`, a `ContentProvider` whose `onCreate()` Android guarantees runs
  before any other component, registers `WatchStopListener` — the phone-side half of
  symmetric stop signals (issue #255 Phase 4A): when the watch dismisses/snoozes a ringing
  alarm while the phone's own Rust hasn't booted yet, wear-sync publishes on
  `NativeEventBus`'s `wear:alarm:dismiss`/`wear:alarm:snooze` topics (payload keyed
  `"alarmId"`, not `"id"` — see the topic table linked above), and `WatchStopListener`
  stops `AlarmRingingService` directly, with no dependency on Rust.

## Intent Extras

- `com.windowalarm.ALARM_TRIGGER`: Action for `AlarmReceiver`.
- `ALARM_ID` (int): The ID of the alarm.
- `ALARM_SOUND_URI` (String): The URI of the sound to play.

## Android Constraints & Rationale

1.  **Notification Channels**: Modifying the sound of an existing Notification Channel is not supported on Android 8+. To support per-alarm sounds, we cannot rely on `Notification.sound`.
2.  **Foreground Service**: Required to ensure the alarm plays reliably while the app is in the background or device is dozing. `startForegroundService` must be accompanied by a visible notification within 5 seconds.
3.  **Permissions**:
    - `FOREGROUND_SERVICE`: General requirement.
    - `FOREGROUND_SERVICE_MEDIA_PLAYBACK`: Specific type for Android 14+ compliance regarding audio playback.

## Testing Checklist

- [ ] **Pick Sound**: Calling `pickAlarmSound` opens system picker. Selection returns correct URI. "Silent" returns null.
- [ ] **Schedule**: Saving an alarm with a sound persists URI to DB and native SharedPreferences.
- [ ] **Database Migration**: Verify `sound_uri` and `sound_title` columns are added to `alarms` table on update.
- [ ] **Ring**: When alarm triggers:
  - [ ] Foreground notification appears.
  - [ ] Sound plays (if set).
  - [ ] Vibration occurs.
  - [ ] Dismiss action stops sound and notification.
- [ ] **Silent**: Alarm with `soundUri: null` only vibrates.
- [ ] **Reboot**: After reboot, alarm still fires with the correct sound.
