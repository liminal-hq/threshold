# Threshold Wear OS Companion

A standalone Wear OS app that displays and controls alarms from the Threshold phone app.

## Architecture

Threshold-Wear is a **standalone Android Wear OS application** that runs on watch hardware. It is not a Tauri plugin — Tauri only runs on the phone. The two apps communicate over Bluetooth via the [Wear Data Layer API](https://developer.android.com/training/wearables/data-layer).

```
Phone (Tauri + Rust + Kotlin)          Watch (Pure Android/Kotlin)
┌─────────────────────────┐            ┌─────────────────────────┐
│ wear-sync plugin        │            │ threshold-wear app      │
│  ├─ BatchCollector      │            │  ├─ AlarmRepository     │
│  ├─ ChannelPublisher    │  Bluetooth │  ├─ WearDataLayerClient │
│  ├─ WearSyncPlugin.kt ─┼────────────┼──┤ DataLayerListener    │
│  └─ WearMessageService ─┼────────────┼──┤ AlarmListScreen      │
└─────────────────────────┘            │  ├─ NextAlarmTile       │
                                       │  └─ NextAlarmComplication│
                                       └─────────────────────────┘
```

## Features

- **Alarm list**: View all alarms with time, label, and enabled/disabled status
- **Toggle alarms**: Tap an alarm card to toggle its enabled state on the phone
- **Delete alarms**: Long-press an alarm card for a delete confirmation dialog
- **Sync status**: Header shows connected (green), syncing (spinner), or offline (yellow)
- **Tile**: Shows next upcoming alarm time in the tile carousel
- **Complication**: Provides next alarm time for watch face complications (short and long text)

## Project Structure

```
apps/threshold-wear/
├── build.gradle.kts                    # Wear OS app config
├── settings.gradle.kts                 # Gradle settings
├── proguard-rules.pro                  # ProGuard rules for release builds
└── src/main/
    ├── AndroidManifest.xml             # Wear OS app declaration
    └── java/ca/liminalhq/threshold/wear/
        ├── ThresholdWearApp.kt         # Application class (singletons)
        ├── data/
        │   ├── AlarmRepository.kt      # Local alarm cache (StateFlow + SharedPrefs)
        │   ├── SyncStatus.kt           # Connected / Syncing / Offline enum
        │   ├── WatchAlarm.kt           # Watch-side alarm data class
        │   └── WearDataLayerClient.kt  # MessageClient wrapper for phone comms
        ├── presentation/
        │   ├── MainActivity.kt         # Single-activity Compose host
        │   ├── AlarmListScreen.kt      # Alarm list UI (ScalingLazyColumn)
        │   └── theme/
        │       └── Theme.kt           # Deep black + calm blue palette
        ├── service/
        │   └── DataLayerListenerService.kt  # Receives DataItem changes from phone
        └── tile/
            ├── NextAlarmTileService.kt       # Wear OS tile
            └── NextAlarmComplicationService.kt # Watch face complication
```

## Data Flow

### Receiving Alarm Data (Phone → Watch)

1. Phone's `WearSyncPlugin.kt` writes a `PutDataMapRequest` to `/threshold/alarms`
2. `DataLayerListenerService.onDataChanged()` receives the `DataItem`
3. Parses `alarmsJson` and `revision` from the `DataMap`
4. Updates `AlarmRepository` via `replaceAll()` (full sync) or `applyIncremental()` (delta)
5. Compose UI observes `StateFlow<List<WatchAlarm>>` and redraws

### Sending Commands (Watch → Phone)

1. User taps alarm card → `WearDataLayerClient.sendSaveAlarm()` called
2. Sends `MessageClient` message to `/threshold/save_alarm` with JSON payload
3. Phone's `WearMessageService.kt` receives message
4. Routes to `WearSyncPlugin.onWatchMessage()` → Tauri event → Rust handler

### Sync Request

On app launch, the watch sends a sync request with its `lastSyncRevision` to `/threshold/sync_request`. The phone determines whether to send an incremental update or full sync based on the revision gap.

## Design Tokens

| Token | Value | Purpose |
|-------|-------|---------|
| Background | `#0A0A0A` | Deep black for OLED |
| Surface | `#1A1A1A` | Card backgrounds |
| Accent | `#4A9EFF` | Calm blue, enabled indicators |
| On Surface | `#E0E0E0` | Primary text |
| Disabled | `#333333` | Disabled indicators |
| Error | `#CF6679` | Error states |

Touch targets are 48dp minimum. Time is displayed at 24sp bold, labels at 13sp.

## Dependencies

- **Wear OS**: `androidx.wear:wear:1.3.0`, `androidx.wear.compose:compose-material:1.2.1`
- **Compose**: `androidx.activity:activity-compose:1.8.2`, `androidx.compose.ui:ui:1.5.4`
- **Tiles**: `androidx.wear.tiles:tiles:1.2.0`
- **Complications**: `androidx.wear.watchface:watchface-complications-data-source:1.2.0`
- **Data Layer**: `com.google.android.gms:play-services-wearable:18.1.0`
- **Coroutines**: `org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3`

## Getting Started

### Prerequisites

- Android Studio (Arctic Fox or later) with Wear OS support
- A Wear OS watch or emulator (API 26+)
- The Threshold phone app installed on a paired phone or emulator
- Google Play Services on both devices

### Development Setup

1. **Open in Android Studio:**
   Open `apps/threshold-wear/` as a standalone Android project in Android Studio.

2. **Create a Wear OS emulator:**
   In AVD Manager, create a Wear OS device (e.g. Wear OS Round, API 33).

3. **Create a phone emulator (if not using a real device):**
   Create a standard Android phone emulator (e.g. Pixel 7, API 34) with Google Play Services.

4. **Pair the emulators:**
   ```bash
   # Start both emulators, then pair them
   adb -s emulator-5554 forward tcp:5601 tcp:5601
   # On the phone emulator, open the Wear OS companion app and pair
   ```
   Alternatively, use Android Studio's Device Manager to pair them directly.

5. **Build and deploy the watch app:**
   ```bash
   cd apps/threshold-wear
   ./gradlew installDebug
   ```
   Or use the Run button in Android Studio with the Wear OS emulator selected.

6. **Build and deploy the phone app:**
   ```bash
   cd apps/threshold
   pnpm tauri android dev
   ```

### First Run

When the watch app launches for the first time:

1. It sends a sync request to the phone with revision `0`
2. The phone responds with a full sync containing all alarms
3. The alarm list populates and the sync status changes from "Offline" to "Connected"

If no alarms appear, check:
- Both devices are paired (Wear OS companion app on phone shows connection)
- The phone app is running (the wear-sync plugin needs to be active)
- Logcat for `WearSyncPlugin` or `DataLayerListener` tags

### User Guide

**Viewing alarms:** Open the app on your watch. Alarms are listed by time with a coloured dot indicating enabled (blue) or disabled (grey) status.

**Toggling an alarm:** Tap an alarm card to toggle its enabled state. The command is sent to the phone, which processes it and syncs the updated state back.

**Deleting an alarm:** Long-press an alarm card to show a delete confirmation dialog. Tap "Delete" to remove it from both watch and phone.

**Syncing:** The watch syncs automatically when the phone publishes alarm changes. To manually request a sync, tap the "Sync" button on the empty state screen, or relaunch the app.

**Tile:** Add the Threshold tile to your tile carousel (swipe left from the watch face → "+" → Threshold). It shows the next upcoming alarm time.

**Complication:** Add the Threshold complication to a compatible watch face. It provides the next alarm time in short or long text format.

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Offline" status permanently | Phone not paired or app not running | Check Wear OS pairing, launch phone app |
| Alarms don't appear | Sync hasn't happened yet | Relaunch watch app to trigger sync request |
| Toggle doesn't work | Phone app not processing messages | Check logcat for `WearMessageService` errors |
| Tile shows "No alarms" | No enabled alarms, or tile not refreshed | Enable an alarm, then swipe away and back to tile |

## Building

This is a standalone Android project. It can be built separately from the main Threshold app:

```bash
cd apps/threshold-wear
./gradlew assembleDebug
```

For development with a watch emulator, pair a Wear OS emulator with a phone emulator in Android Studio and deploy to the watch target.

## Distribution

The watch app can be bundled in the same Play Store listing as the phone app so users get both with a single install, or published as a separate listing. Set `com.google.android.wearable.standalone` to `true` in the manifest if publishing independently.
