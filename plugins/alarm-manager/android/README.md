# Alarm Manager Android Library

This is the native Android implementation for the Alarm Manager plugin.

## Key Components

- **AlarmManagerPlugin.kt**: The bridge receiving commands from Rust/JavaScript.
- **AlarmReceiver.kt**: The `BroadcastReceiver` that triggers when the alarm fires. It launches the App Activity using a full-screen Intent/Notification.
- **BootReceiver.kt**: Reschedules alarms after a device reboot (`BOOT_COMPLETED`) using locally persisted data (`SharedPreferences`).

## Permissions

This library requires the following permissions to ensure the alarm wakes the device reliably:

- `SCHEDULE_EXACT_ALARM` (Android 12+): Allows the app to schedule precise alarms.
- `USE_EXACT_ALARM` (Android 13+): Declares the app as an alarm clock/timer app which requires exact timing.
- `WAKE_LOCK`: Keeps the CPU running while the alarm is processing.
- `RECEIVE_BOOT_COMPLETED`: allows the app to reschedule alarms after a reboot.
- `POST_NOTIFICATIONS` (Android 13+): Required to show the full-screen alarm notification.
