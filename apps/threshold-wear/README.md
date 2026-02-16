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

## Building

This is a standalone Android project. It can be built separately from the main Threshold app:

```bash
cd apps/threshold-wear
./gradlew assembleDebug
```

For development with a watch emulator, pair a Wear OS emulator with a phone emulator in Android Studio and deploy to the watch target.

## Distribution

The watch app can be bundled in the same Play Store listing as the phone app so users get both with a single install, or published as a separate listing. Set `com.google.android.wearable.standalone` to `true` in the manifest if publishing independently.
