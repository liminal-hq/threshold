# Android Intents

The Android plugin supports the standard `android.intent.action.SET_ALARM` intent.

## Supported Extras

- `android.intent.extra.alarm.HOUR` (int)
- `android.intent.extra.alarm.MINUTES` (int)
- `android.intent.extra.alarm.MESSAGE` (string)
- `android.intent.extra.alarm.SKIP_UI` (boolean)

## Testing with ADB

```bash
adb shell am start -a android.intent.action.SET_ALARM --ei android.intent.extra.alarm.HOUR 7 --ei android.intent.extra.alarm.MINUTES 30 --es android.intent.extra.alarm.MESSAGE "Test Alarm" --ez android.intent.extra.alarm.SKIP_UI true
```
