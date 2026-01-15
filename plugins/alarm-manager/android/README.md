# Alarm Manager Android Library

This is the native Android implementation for the Alarm Manager plugin.

## Key Components

- **AlarmManagerPlugin.kt**: The bridge receiving commands from Rust/JavaScript.
- **AlarmReceiver.kt**: The `BroadcastReceiver` that triggers when the alarm fires. It launches the App Activity using a full-screen Intent/Notification.
- **BootReceiver.kt**: Reschedules alarms after a device reboot (`BOOT_COMPLETED`) using locally persisted data (`SharedPreferences`).

## Permissions

Uses `SCHEDULE_EXACT_ALARM` and `USE_EXACT_ALARM` to ensure reliability.
