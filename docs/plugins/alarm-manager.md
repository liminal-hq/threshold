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
    soundUri?: string | null;   // content:// URI or null for Silent
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

*   `pickSound(currentUri?: string, title?: string)`: Invokes the native picker.
*   Returns `Promise<PickedAlarmSound>`.

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

*   `sound_uri` (TEXT, nullable)
*   `sound_title` (TEXT, nullable)

**Migration Strategy**:
Schema migrations are handled by the Rust core (`AlarmDatabase`) at startup via the `sqlx` migration system.

### SharedPreferences (Android Native)

To support boot rescheduling and independent ringing, the native plugin stores alarm metadata in `SharedPreferences` ("ThresholdNative"):

*   Key: `alarm_{id}` -> Value: `triggerAt` (Long)
*   Key: `alarm_sound_{id}` -> Value: `soundUri` (String) [NEW]

## Scheduling Flows

### Current Architecture (Event-Driven)

The Rust core (`AlarmCoordinator`) is the single owner of scheduling. The plugin listens for events emitted by the coordinator and drives native scheduling accordingly.

1.  **Create/Update**:
    *   UI calls `AlarmService.save()` → Rust `AlarmCoordinator` saves to SQLite, calculates `next_trigger`.
    *   Coordinator emits `alarm:scheduled` event with `{ id, triggerAt, soundUri }`.
    *   Plugin (Rust listener) receives event → calls into Kotlin via Tauri command bridge.
    *   Kotlin: `AlarmUtils.scheduleAlarm` stores metadata in SharedPreferences and sets `AlarmManager` with a `PendingIntent` targeting `AlarmReceiver`.

2.  **Boot Reschedule**:
    *   Kotlin: `BootReceiver` triggers on device boot.
    *   Kotlin: Reads all `alarm_{id}` from SharedPreferences.
    *   Kotlin: Retrieves corresponding `soundUri`.
    *   Kotlin: Re-schedules valid future alarms via `AlarmManager`.

3.  **Cancel**:
    *   Coordinator emits `alarm:cancelled` event with `{ id }`.
    *   Plugin receives event → calls Kotlin `AlarmUtils.cancelAlarm`.
    *   Kotlin: Cancels `PendingIntent` and removes entries from SharedPreferences.

> **Note:** The event system that drives these flows is defined in [event-architecture.md](../architecture/event-architecture.md). Once the Level 3 Granular Event System (issue #112) is implemented, this plugin will subscribe to `alarm:scheduled` and `alarm:cancelled` events with full revision tracking.

## Ringing Flows

### 1. Alarm Trigger
*   System fires `PendingIntent` -> `AlarmReceiver.onReceive`.
*   `AlarmReceiver` extracts `soundUri` from Intent extras (or looks up prefs).
*   `AlarmReceiver` starts `AlarmRingingService` (Foreground Service) via `startForegroundService` (Android O+).

### 2. Foreground Service (`AlarmRingingService`)
*   **On Start**:
    *   Acquires WakeLock (partial).
    *   Posts a high-priority **Foreground Notification** (channel `alarm_ringing_service`, silent sound).
    *   Requests **Audio Focus** (`USAGE_ALARM`, `CONTENT_TYPE_SONIFICATION`).
    *   Starts **MediaPlayer** with the `soundUri` (looping).
    *   Starts **Vibration**.
*   **Notification Actions**:
    *   **Dismiss**: Sends intent to stop the service.
    *   **Snooze**: (Future) Stops service and schedules new alarm.

### 3. Stop/Dismiss
*   User taps "Dismiss" on notification OR opens app and taps "Stop".
*   Service calls `stopSelf()`, releases WakeLock, abandons audio focus, stops player.

## Intent Extras

*   `com.windowalarm.ALARM_TRIGGER`: Action for `AlarmReceiver`.
*   `ALARM_ID` (int): The ID of the alarm.
*   `ALARM_SOUND_URI` (String): The URI of the sound to play.

## Android Constraints & Rationale

1.  **Notification Channels**: Modifying the sound of an existing Notification Channel is not supported on Android 8+. To support per-alarm sounds, we cannot rely on `Notification.sound`.
2.  **Foreground Service**: Required to ensure the alarm plays reliably while the app is in the background or device is dozing. `startForegroundService` must be accompanied by a visible notification within 5 seconds.
3.  **Permissions**:
    *   `FOREGROUND_SERVICE`: General requirement.
    *   `FOREGROUND_SERVICE_MEDIA_PLAYBACK`: Specific type for Android 14+ compliance regarding audio playback.

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
