# Alarm Manager Specification

## Overview

The Window Alarm application requires a robust alarm management system on Android that supports per-alarm sound selection and reliable ringing behaviour. This specification details the implementation of the "native-like" alarm system, which includes:

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

#### `AlarmSoundPickerService` (`apps/window-alarm/src/services/AlarmSoundPickerService.ts`)

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
On app init, `DatabaseService` checks for the existence of these columns and executes `ALTER TABLE` if they are missing.

### SharedPreferences (Android Native)

To support boot rescheduling and independent ringing, the native plugin stores alarm metadata in `SharedPreferences` ("WindowAlarmNative"):

*   Key: `alarm_{id}` -> Value: `triggerAt` (Long)
*   Key: `alarm_sound_{id}` -> Value: `soundUri` (String) [NEW]

## Scheduling Flows

1.  **Create/Update**:
    *   TS: `AlarmManagerService.saveAndSchedule(alarm)` saves to DB.
    *   TS: Invokes `plugin:alarm-manager|schedule` with payload `{ id, triggerAt, soundUri }`.
    *   Kotlin: `AlarmManagerPlugin` calls `AlarmUtils.scheduleAlarm`.
    *   Kotlin: `AlarmUtils` stores `triggerAt` and `soundUri` in SharedPreferences.
    *   Kotlin: Sets `AlarmManager` with a `PendingIntent` targeting `AlarmReceiver`.

2.  **Boot Reschedule**:
    *   Kotlin: `BootReceiver` triggers on device boot.
    *   Kotlin: Reads all `alarm_{id}` from SharedPreferences.
    *   Kotlin: Retrieves corresponding `soundUri`.
    *   Kotlin: Re-schedules valid future alarms via `AlarmManager`.

3.  **Cancel**:
    *   TS: Invokes `plugin:alarm-manager|cancel`.
    *   Kotlin: Cancels `PendingIntent` and removes entries from SharedPreferences.

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
