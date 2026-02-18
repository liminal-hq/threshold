# Wear OS Testing Guide

A hands-on guide for building, installing, debugging, and testing the Threshold Wear OS companion app and the phone-side wear-sync plugin.

## Table of Contents

- [Quick Start](#quick-start)
- [Environment Setup](#environment-setup)
- [Building the Apps](#building-the-apps)
- [Installing to Devices](#installing-to-devices)
- [ADB Essentials](#adb-essentials)
- [Reading Logs](#reading-logs)
- [Testing the Sync Pipeline](#testing-the-sync-pipeline)
- [Testing the Watch UI](#testing-the-watch-ui)
- [Testing Tiles and Complications](#testing-tiles-and-complications)
- [Running Unit Tests](#running-unit-tests)
- [Common Issues](#common-issues)

---

## Quick Start

If you already have the devcontainer running and a watch connected via USB:

```bash
# Build and install the watch app
cd apps/threshold-wear
./gradlew installDebug

# Launch it
adb shell am start -n ca.liminalhq.threshold.wear/.presentation.MainActivity

# Watch the logs
adb logcat -s DataLayerListener:* NextAlarmTile:* WearDataLayer:* ThresholdWearApp:*
```

For the phone app (in a separate terminal):

```bash
cd apps/threshold
pnpm tauri android dev
```

---

## Environment Setup

### Option A: Devcontainer (Recommended)

The project devcontainer includes Java 17, Android SDK, and all build tools. Open the project in VS Code with the Dev Containers extension and you're ready to build.

The devcontainer **does not** include an emulator (requires KVM). You have two options for a target device:

1. **Real watch over USB** — connect the watch, enable ADB debugging in Developer Options
2. **Emulator on the host** — run the emulator outside the container and forward ADB

### Option B: Local Machine

Install these manually:

```bash
# Java 17
sudo apt-get install -y openjdk-17-jdk    # Linux
brew install openjdk@17                     # macOS

# Android SDK command line tools
# Download from https://developer.android.com/studio#command-line-tools-only
# Then:
sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools"
```

### Enabling ADB on a Wear OS Watch

1. Open **Settings** on the watch
2. Tap **About** → tap **Build number** 7 times to enable Developer Options
3. Go back to **Settings** → **Developer options**
4. Enable **ADB debugging**
5. For wireless: enable **Debug over Wi-Fi**, note the IP:port shown
6. For USB: connect the watch cradle to your computer via USB

### Enabling ADB on an Android Phone

1. Open **Settings** → **About phone** → tap **Build number** 7 times
2. Go to **Settings** → **Developer options** → enable **USB debugging**
3. Connect via USB, accept the debugging prompt on the phone

---

## Building the Apps

### Watch App

```bash
cd apps/threshold-wear

# Debug build (faster, not optimised)
./gradlew assembleDebug

# Build + install in one step
./gradlew installDebug

# Release build (minified with ProGuard)
./gradlew assembleRelease
```

The APK is output to `build/outputs/apk/debug/threshold-wear-debug.apk`.

### Phone App

```bash
cd apps/threshold

# Development mode (hot reload)
pnpm tauri android dev

# Build APK
pnpm tauri android build --debug
```

---

## Installing to Devices

### List Connected Devices

```bash
adb devices -l
```

Example output:

```
List of devices attached
192.168.1.42:5555     device    product:bluejay    model:Pixel_Watch    transport_id:1
emulator-5554         device    product:sdk_gphone  model:Pixel_7       transport_id:2
```

### Install to a Specific Device

When multiple devices are connected, use `-s` to target one:

```bash
# Install watch app to the watch
adb -s 192.168.1.42:5555 install apps/threshold-wear/build/outputs/apk/debug/threshold-wear-debug.apk

# Or use Gradle with the device serial
cd apps/threshold-wear
ANDROID_SERIAL=192.168.1.42:5555 ./gradlew installDebug
```

### Wireless ADB (Watch)

If your watch shows a Wi-Fi debugging address:

```bash
adb connect 192.168.1.42:5555
adb -s 192.168.1.42:5555 install ...
```

### Uninstall

```bash
adb -s <serial> uninstall ca.liminalhq.threshold.wear
adb -s <serial> uninstall ca.liminalhq.threshold
```

---

## ADB Essentials

### Launching the Watch App

```bash
adb shell am start -n ca.liminalhq.threshold.wear/.presentation.MainActivity
```

### Force-Stop (Kill the App)

```bash
adb shell am force-stop ca.liminalhq.threshold.wear
```

### Check if App is Installed

```bash
adb shell pm list packages | grep threshold
```

### Screenshots

```bash
# Take a screenshot from the watch
adb -s <watch-serial> shell screencap -p /sdcard/screenshot.png
adb -s <watch-serial> pull /sdcard/screenshot.png ./watch-screenshot.png
```

### File Access

```bash
# Pull SharedPreferences (alarm cache)
adb shell run-as ca.liminalhq.threshold.wear cat shared_prefs/alarm_cache.xml

# Pull any app file
adb shell run-as ca.liminalhq.threshold.wear cat <path>
```

### Device Info

```bash
# API level
adb shell getprop ro.build.version.sdk

# Wear OS version
adb shell getprop ro.build.display.id

# Check if Google Play Services is available
adb shell pm list packages | grep com.google.android.gms
```

---

## Reading Logs

### Filtered Logcat (Recommended)

Filter by the tags used in the Threshold codebase. Use `-s` to silence
all other tags.

```bash
# Phone — full filter (app + plugins + wear-sync + errors from any tag)
adb logcat -s threshold:* AlarmManager:* AlarmManagerPlugin:* \
  AlarmReceiver:* AlarmRingingService:* BootReceiver:* \
  SetAlarmActivity:* AlarmService:* ThemeUtils:* TimePrefsPlugin:* \
  chromium:I Tauri/Console:* *:E \
  WearSyncPlugin:* WearMessageService:* WearSyncService:* \
  WearSyncCache:* BatchCollector:*

# Watch — full filter
adb logcat -s DataLayerListener:* WearDataLayer:* \
  WearDataLayerClient:* NextAlarmTile:* \
  NextAlarmComplication:* ThresholdWearApp:*
```

When two devices are connected via ADB, target them with `-s <serial>`:

```bash
adb -s <phone-serial> logcat -s WearSyncPlugin:* WearMessageService:* ...
adb -s <watch-serial> logcat -s DataLayerListener:* WearDataLayer:* ...
```

Run `adb devices` to list serials.

### Tag Reference

| Tag | Source | What It Logs |
|-----|--------|-------------|
| **Watch** | | |
| `DataLayerListener` | `DataLayerListenerService.kt` | Incoming data changes, sync payloads, parse errors |
| `WearDataLayer` | `WearDataLayerClient.kt` | Outgoing messages (toggle, delete, sync requests) |
| `WearDataLayerClient` | `WearDataLayerClient.kt` | Node resolution, message send results |
| `ThresholdWearApp` | `ThresholdWearApp.kt` | App initialisation |
| `NextAlarmTile` | `NextAlarmTileService.kt` | Tile render events |
| `NextAlarmComplication` | `NextAlarmComplicationService.kt` | Complication updates |
| **Phone — Wear Sync** | | |
| `WearSyncPlugin` | `WearSyncPlugin.kt` | Data Layer publishes, connected nodes |
| `WearMessageService` | `WearMessageService.kt` | Incoming watch messages, offline cache writes |
| `WearSyncService` | `WearSyncService.kt` | Foreground service boot, cached message replay |
| `WearSyncCache` | `WearSyncCache.kt` | SharedPreferences read/write for offline sync |
| `BatchCollector` | `BatchCollector` (Rust log) | Batch debounce events |
| **Phone — App** | | |
| `threshold` | Tauri Rust runtime | General app-level Rust logs |
| `AlarmManager` | Android system | System alarm scheduling |
| `AlarmManagerPlugin` | `AlarmManagerPlugin.kt` | Plugin bridge calls |
| `AlarmReceiver` | `AlarmReceiver.kt` | Alarm fired broadcast |
| `AlarmRingingService` | `AlarmRingingService.kt` | Ring/vibrate/dismiss |
| `BootReceiver` | `BootReceiver.kt` | Boot recovery scheduling |
| `Tauri/Console` | WebView console | JS `console.log` from the UI |
| `chromium` | WebView engine | WebView internals (use `:I` for info only) |

### Logcat with Timestamps

```bash
adb logcat -v time -s DataLayerListener:*
```

### Save Logs to File

```bash
adb logcat -s DataLayerListener:* WearSyncPlugin:* > wear-debug.log 2>&1 &
# ... reproduce the issue ...
kill %1
```

### Clear Logs

```bash
adb logcat -c
```

### Searching Logs

```bash
# Grep for a specific alarm ID
adb logcat -d | grep "alarm.*42"

# Grep for errors only
adb logcat -d -s DataLayerListener:* | grep -i "error\|fail\|exception"
```

---

## Testing the Sync Pipeline

### End-to-End Sync Test

1. Start both apps:
   ```bash
   # Terminal 1: phone app
   cd apps/threshold && pnpm tauri android dev

   # Terminal 2: watch app
   cd apps/threshold-wear && ./gradlew installDebug
   adb -s <watch> shell am start -n ca.liminalhq.threshold.wear/.presentation.MainActivity
   ```

2. Open logcat on the watch:
   ```bash
   adb -s <watch> logcat -s DataLayerListener:* WearDataLayer:*
   ```

3. Create an alarm on the phone. You should see:
   ```
   D/DataLayerListener: Received alarm data at revision 1
   ```

4. The watch alarm list should update within a few seconds.

### Testing Toggle (Watch to Phone)

1. Tap an alarm card on the watch
2. Watch logcat on the phone:
   ```bash
   adb -s <phone> logcat -s WearMessageService:* WearSyncPlugin:*
   ```
3. You should see:
   ```
   D/WearMessageService: Message received: /threshold/save_alarm
   ```

### Testing Delete (Watch to Phone)

1. Long-press an alarm card on the watch
2. Tap "Delete" in the confirmation dialog
3. Phone logcat should show:
   ```
   D/WearMessageService: Message received: /threshold/delete_alarm
   ```

### Verifying Sync Revision

Check the stored revision on the watch:

```bash
adb -s <watch> shell run-as ca.liminalhq.threshold.wear cat shared_prefs/alarm_cache.xml | grep revision
```

### Simulating Offline / Reconnection

1. Put the watch in airplane mode (Settings → Connectivity → Airplane mode)
2. The watch UI should show "Offline" (yellow indicator)
3. Disable airplane mode
4. On next sync, the status should return to "Connected" (green)

---

## Testing the Watch UI

### Visual Checklist

- [ ] Alarm list scrolls smoothly on round display
- [ ] Status indicator shows correct colour (green = connected, yellow = offline, spinner = syncing)
- [ ] Enabled alarms show blue accent dot, disabled show grey
- [ ] Time is large and bold, label is smaller below
- [ ] Long-press shows delete confirmation dialog
- [ ] "No alarms" empty state appears when list is empty
- [ ] Sync button appears on empty state
- [ ] Material You accent colour matches watch face palette (API 31+ only)

### Checking Material You Colours

On a Pixel Watch or API 31+ emulator:

1. Change the watch face and pick a different colour palette
2. Reopen the Threshold app
3. The accent colour (status dot, progress spinner) should match the new palette

On older watches (API < 31), the accent should always be calm blue (`#4A9EFF`).

---

## Testing Tiles and Complications

### Adding the Tile

1. From the watch face, swipe left to the tile carousel
2. Long-press or scroll to the "+" button
3. Select "Threshold" from the list
4. The tile should show the next alarm time, or "No alarms"

### Forcing a Tile Refresh

```bash
# Request a tile update programmatically
adb shell am broadcast -a com.google.android.clockwork.home.TILE_UPDATE \
  -n ca.liminalhq.threshold.wear/.tile.NextAlarmTileService
```

### Adding the Complication

1. Long-press the watch face → "Customise" → tap a complication slot
2. Select "Threshold" from the data sources
3. It provides the next alarm time in short text format

---

## Running Unit Tests

### Kotlin Tests (Watch App)

```bash
cd apps/threshold-wear
./gradlew testDebugUnitTest
```

Test results are in `build/test-results/testDebugUnitTest/`. The tests cover `WatchAlarm` JSON parsing and serialisation.

### Rust Tests (Wear-Sync Plugin)

```bash
cargo test -p tauri-plugin-wear-sync
```

Covers sync protocol logic, conflict detection, and batch collector behaviour.

### CI

The GitHub Actions workflow (`.github/workflows/test.yml`) runs both Kotlin and Rust tests on every pull request. The `test-kotlin` job uses `android-actions/setup-android@v3` to provision the SDK in CI.

---

## Common Issues

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| `adb: no devices/emulators found` | Watch not connected or ADB not enabled | Check USB connection, enable ADB debugging on watch |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Signing key mismatch from previous install | `adb uninstall ca.liminalhq.threshold.wear` then reinstall |
| `error: device unauthorized` | ADB prompt not accepted on device | Tap "Allow" on the debugging prompt, or revoke + re-enable USB debugging |
| Watch shows "Offline" permanently | Phone app not running or not paired | Launch phone app, verify Wear OS pairing |
| Sync works once then stops | Data Layer deduplication (same data = no event) | The phone includes a timestamp in each publish to ensure uniqueness |
| `./gradlew: Permission denied` | Gradle wrapper not executable | `chmod +x apps/threshold-wear/gradlew` |
| Build fails with `dependencyResolutionManagement` error | Stale Gradle cache | `cd apps/threshold-wear && ./gradlew clean` |
| Tile shows stale data | Tile not refreshed after data change | Swipe away from the tile and back, or force-refresh via ADB |
| Logcat shows nothing for expected tags | Logs cleared or process not running | Verify app is running: `adb shell pidof ca.liminalhq.threshold.wear` |

---

## Useful ADB One-Liners

```bash
# Restart ADB server (fixes many connection issues)
adb kill-server && adb start-server

# Watch logcat in real-time, filtered, with colour
adb logcat -v color -s DataLayerListener:* WearDataLayer:*

# Dump all SharedPreferences for the app
adb shell run-as ca.liminalhq.threshold.wear ls shared_prefs/

# Check battery level (useful for Wear OS testing)
adb shell dumpsys battery | grep level

# Screen on/off
adb shell input keyevent KEYCODE_WAKEUP
adb shell input keyevent KEYCODE_SLEEP

# Simulate a tap at coordinates (for automation)
adb shell input tap 180 180
```
