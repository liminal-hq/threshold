---
title: "Building a Wear OS Companion App for a Tauri Android Application"
date: "2026-02-17"
slug: "wear-os-tauri"
excerpt: "Tauri v2 brought first-class Android support to the Rust-based app framework. This post walks through adding Wear OS support to Threshold by building a standalone companion app."
tags:
  - "Rust"
  - "Tauri"
  - "Android"
  - "Wear OS"
  - "Kotlin"
draft: false
---

Tauri v2 brought first-class Android support to the Rust-based app framework, letting developers build mobile apps with a web frontend and a Rust backend. But what about wearables? Google's Wear OS ecosystem expects a companion app that syncs data with the phone — and Tauri has no built-in story for that.

This post walks through how we added Wear OS support to [Threshold](https://github.com/anthropics/threshold), a Tauri v2 alarm clock app, by building a standalone Wear OS companion app and a custom Tauri plugin that bridges Rust business logic to the Android Wear Data Layer API.

## The Architecture at a Glance

The system has three components:

1. **Phone app** — A Tauri v2 app (React + Rust) that owns the SQLite database and schedules alarms via Android's `AlarmManager`.
2. **Wear OS companion app** — A standalone Kotlin/Compose for Wear OS app that displays alarms on the watch and sends toggle/delete commands back to the phone.
3. **`wear-sync` Tauri plugin** — A Rust + Kotlin plugin that connects the phone app's event system to Google's Wear Data Layer API.

The phone is the single source of truth. The watch is a remote view with limited write-back capability. Data flows through Google's Wear Data Layer, which handles Bluetooth transport, queuing, and delivery when devices reconnect.

```
┌─────────────────────────────────────────────────┐
│  Phone (Tauri v2)                               │
│                                                 │
│  React UI ←→ Rust (AlarmCoordinator + SQLite)   │
│                    ↕                            │
│            wear-sync plugin (Rust)              │
│                    ↕                            │
│            wear-sync plugin (Kotlin)            │
│                    ↕                            │
│       Google Wear Data Layer (DataClient)       │
└─────────────────────────────────────────────────┘
                     ↕  Bluetooth
┌─────────────────────────────────────────────────┐
│  Watch (Wear OS)                                │
│                                                 │
│  Compose UI ← AlarmRepository (in-memory cache) │
│                    ↕                            │
│       DataLayerListenerService (DataItems)       │
│       WearDataLayerClient (Messages)            │
└─────────────────────────────────────────────────┘
```

## Why Not Just Extend the Tauri App?

Wear OS apps are standalone APKs. They don't run inside the phone app's process, and they can't share a WebView. Even if Tauri could target Wear OS (it can't — Wear OS doesn't support the WebView-based rendering Tauri relies on), the watch's constrained resources make a native Compose UI the right choice.

The companion app pattern is Google's recommended approach: a lightweight native watch app that communicates with the phone via the Wear Data Layer API. This also means the watch app works independently — it caches data locally and can display alarms even when disconnected from the phone.

## The Wear-Sync Plugin: Bridging Rust and the Wear Data Layer

Tauri v2's plugin system supports platform-specific code through a layered architecture: Rust logic on top, with a Kotlin (or Swift) layer underneath for native API access. The `wear-sync` plugin uses this to bridge the gap between Rust's event-driven alarm system and Android's Wear Data Layer.

### Rust Side: Event Listeners and Batch Debouncing

The plugin's Rust entry point listens for alarm change events and routes them to the watch:

```rust
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("wear-sync")
        .setup(|app, api| {
            #[cfg(mobile)]
            let wear_sync = mobile::init(app, api)?;
            app.manage(wear_sync);

            let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<PublishCommand>();
            spawn_publish_task(app.clone(), rx);

            let publisher: Arc<dyn WearSyncPublisher> =
                Arc::new(ChannelPublisher::new(tx));
            let batch_collector =
                Arc::new(BatchCollector::new(500, Arc::clone(&publisher)));

            // Listen for alarm changes and debounce before publishing
            app.listen("alarms:batch:updated", move |event| {
                let payload: AlarmsBatchUpdated =
                    serde_json::from_str(event.payload()).unwrap();
                batch_collector.add(payload.updated_ids, payload.revision).await;
            });

            // Listen for full sync requests (initial load, watch reconnect)
            app.listen("alarms:sync:needed", move |event| {
                let payload: AlarmsSyncNeeded =
                    serde_json::from_str(event.payload()).unwrap();
                publisher.publish_immediate(&payload.reason, payload.revision,
                    payload.all_alarms_json);
            });

            Ok(())
        })
        .build()
}
```

A key design decision here is **batch debouncing**. When a user edits multiple alarms in quick succession, the `BatchCollector` coalesces them with a 500ms window rather than firing a sync for each change:

```rust
pub struct BatchCollector {
    pending_ids: Arc<Mutex<HashSet<i32>>>,
    latest_revision: Arc<Mutex<i64>>,
    debounce_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
    debounce_ms: u64,
    publisher: Arc<dyn WearSyncPublisher>,
}
```

Each call to `add()` extends the pending set and restarts the debounce timer. When the timer fires, all accumulated IDs are published as a single batch. If a full sync arrives before the timer fires, `flush()` cancels the pending batch since the full sync supersedes it.

### Kotlin Side: DataClient and MessageClient

The Kotlin half of the plugin handles the actual Wear Data Layer calls. Tauri's `@Command` annotation exposes methods that the Rust side can invoke via `run_mobile_plugin()`:

```kotlin
@TauriPlugin
class WearSyncPlugin(private val activity: Activity) : Plugin(activity) {

    private val dataClient by lazy { Wearable.getDataClient(activity) }

    @Command
    fun publishToWatch(invoke: Invoke) {
        val args = invoke.parseArgs(PublishRequest::class.java)
        scope.launch {
            val request = PutDataMapRequest.create("/threshold/alarms").apply {
                dataMap.putString("alarmsJson", args.alarmsJson)
                dataMap.putLong("revision", args.revision)
                dataMap.putLong("timestamp", System.currentTimeMillis())
            }
            request.setUrgent()
            dataClient.putDataItem(request.asPutDataRequest()).await()

            // Cache for offline sync responses
            WearSyncCache.write(activity, args.alarmsJson, args.revision)
            invoke.resolve()
        }
    }
}
```

The Rust-to-Kotlin bridge is surprisingly clean. On the Rust side, a single `run_mobile_plugin` call is all it takes:

```rust
pub struct WearSync<R: Runtime> {
    handle: PluginHandle<R>,
}

impl<R: Runtime> WearSync<R> {
    pub fn publish_to_watch(&self, request: PublishRequest) -> Result<()> {
        self.handle
            .run_mobile_plugin("publishToWatch", request)
            .map_err(Into::into)
    }
}
```

Tauri handles the serialization, JNI bridging, and threading automatically. You define a Rust struct with `#[derive(Serialize)]`, a Kotlin class with `@InvokeArg`, and Tauri connects them.

## Two Protocols, Two Purposes

The Wear Data Layer provides two communication primitives, and the architecture uses both for different purposes:

**DataClient (phone → watch):** Persistent, queued delivery. When the phone publishes alarm data as a `DataItem`, Google Play Services guarantees delivery — even if the watch is temporarily disconnected. The watch receives it through a `WearableListenerService` that Android starts automatically. This is the right choice for pushing state from the source of truth to the replica.

**MessageClient (watch → phone):** Fire-and-forget, requires an active connection. The watch uses this for commands like "toggle alarm #3" or "delete alarm #7". Messages are lightweight and immediate, but they're dropped if the phone isn't reachable. This is fine for user-initiated actions where the UI can show connection status.

```kotlin
// Watch side: sending a command to the phone
class WearDataLayerClient(context: Context) {
    private val messageClient = Wearable.getMessageClient(context)
    private val nodeClient = Wearable.getNodeClient(context)

    suspend fun sendSaveAlarm(alarmId: Int, enabled: Boolean, watchRevision: Long) {
        val json = JSONObject().apply {
            put("alarmId", alarmId)
            put("enabled", enabled)
            put("watchRevision", watchRevision)
        }
        sendToPhone("/threshold/save_alarm", json.toString().toByteArray())
    }

    private suspend fun sendToPhone(path: String, payload: ByteArray) {
        val nodes = nodeClient.connectedNodes.await()
        for (node in nodes) {
            messageClient.sendMessage(node.id, path, payload).await()
        }
    }
}
```

## The Sync Protocol: Revisions, Not Timestamps

Rather than syncing individual field changes, the system uses a **revision counter**. Every alarm mutation on the phone increments a global revision number. The watch tracks its last-seen revision and sends it when requesting a sync.

The phone then decides what to send:

```rust
pub fn determine_sync_type(watch_revision: i64, current_revision: i64) -> SyncType {
    if watch_revision == current_revision {
        SyncType::UpToDate
    } else if watch_revision > current_revision {
        // Anomaly (e.g., phone data reset) — force full sync
        SyncType::FullSync
    } else if current_revision - watch_revision <= 100 {
        SyncType::Incremental
    } else {
        SyncType::FullSync
    }
}
```

The response is a tagged JSON enum that the watch parses:

```json
{"type": "FullSync", "currentRevision": 42, "allAlarms": [...]}
{"type": "Incremental", "currentRevision": 42, "updatedAlarms": [...], "deletedAlarmIds": [3, 7]}
{"type": "UpToDate", "currentRevision": 42}
```

In practice, we found that **FullSync is almost always the right answer**. The alarm dataset is small (typically under 20 alarms), and the simplicity of always sending complete state eliminates an entire class of consistency bugs. The incremental path exists for theoretical efficiency but the threshold is set high (100 revisions) to prefer full syncs.

## Handling the Offline Problem

The trickiest part of the integration isn't the happy path — it's what happens when the user toggles an alarm from their watch while the phone app isn't running.

Android's Wear Data Layer delivers messages to a `WearableListenerService` that runs independently of your app. But the Tauri runtime isn't loaded, so there's no Rust code to process the alarm change. We handle this with a three-tier approach:

**Tier 1 — Online (plugin loaded):** Messages route directly through the Tauri event system to Rust.

**Tier 2 — Offline reads:** When the watch requests a sync and the plugin isn't loaded, the `WearMessageService` serves from a `SharedPreferences` cache that was written on the last publish. No need to boot the Tauri runtime just to echo back cached data.

```kotlin
// In WearMessageService
private fun handleOfflineSyncRequest() {
    val cached = WearSyncCache.read(this) ?: return
    val (alarmsJson, revision) = cached

    scope.launch {
        val request = PutDataMapRequest.create("/threshold/alarms").apply {
            dataMap.putString("alarmsJson", alarmsJson)
            dataMap.putLong("revision", revision)
            dataMap.putLong("timestamp", System.currentTimeMillis())
        }
        request.setUrgent()
        dataClient.putDataItem(request.asPutDataRequest()).await()
    }
}
```

**Tier 3 — Offline writes:** When the watch sends a save or delete command and the plugin isn't loaded, the message is first persisted to `WearSyncQueue`, then a foreground service boots the Tauri runtime headlessly. After the Kotlin `Channel` is registered and the app crate explicitly signals listener readiness, queued messages are drained and forwarded:

```kotlin
private fun bootTauriAndProcessQueue(path: String, data: String) {
    WearSyncQueue.enqueue(this, path, data)

    scope.launch {
        // Launch the main activity silently to boot Tauri
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        launchIntent?.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION
        )
        startActivity(launchIntent)

        // Service waits until:
        // 1) setWatchMessageHandler registered the Channel
        // 2) markWatchPipelineReady signalled Rust listeners are bound
        // Then queued messages are delivered via channel.send(...)
    }
}
```

This pattern — queue first, then foreground-service boot with an explicit readiness handshake — avoids early-replay races during cold start and is reusable for any Tauri Android app that needs reliable background write handling.

## The Watch App: Compose for Wear OS

The companion app itself is a standard Compose for Wear OS application. It's completely separate from Tauri — no WebView, no Rust, just Kotlin and Jetpack Compose with the Wear OS material library.

The data layer is simple: an `AlarmRepository` backed by `SharedPreferences` for persistence across process restarts, with a `StateFlow` for reactive UI updates:

```kotlin
class AlarmRepository {
    private val _alarms = MutableStateFlow<List<WatchAlarm>>(emptyList())
    val alarms: StateFlow<List<WatchAlarm>> = _alarms.asStateFlow()

    fun replaceAll(alarms: List<WatchAlarm>, revision: Long) {
        _alarms.value = alarms
        this.revision = revision
        persistToSharedPreferences()
    }

    fun applyIncremental(updated: List<WatchAlarm>, deleted: List<Int>, revision: Long) {
        val current = _alarms.value.toMutableList()
        current.removeAll { it.id in deleted }
        for (alarm in updated) {
            val index = current.indexOfFirst { it.id == alarm.id }
            if (index >= 0) current[index] = alarm else current.add(alarm)
        }
        _alarms.value = current
        this.revision = revision
        persistToSharedPreferences()
    }
}
```

A `DataLayerListenerService` receives `DataItem` changes from the phone and updates the repository. Because it's a `WearableListenerService`, Android starts it automatically — no foreground service or polling needed on the watch side.

## Build System Integration

Both apps must share the same `applicationId` for the Wear Data Layer to work — this is how Google Play Services knows they're paired. The watch app uses a separate `namespace` for Kotlin code generation but the same `applicationId` as the phone app:

```kotlin
// apps/threshold-wear/build.gradle.kts
android {
    namespace = "ca.liminalhq.threshold.wear"  // Kotlin/R class generation

    defaultConfig {
        applicationId = "ca.liminalhq.threshold"  // MUST match phone app
        minSdk = 26  // Wear OS 2.0+
    }
}
```

The release build script builds both apps sequentially — the Tauri phone app first, then the Wear OS app via Gradle — producing two separate AAB files for upload to the Play Store. Google Play handles pairing them through the shared application ID.

## Manifest Configuration

The phone app's `AndroidManifest.xml` registers the `WearMessageService` with an intent filter so Google Play Services knows to deliver watch messages to it:

```xml
<service android:name=".WearMessageService" android:exported="true">
    <intent-filter>
        <action android:name="com.google.android.gms.wearable.MESSAGE_RECEIVED" />
        <data android:scheme="wear" android:host="*"
              android:pathPrefix="/threshold/" />
    </intent-filter>
</service>

<service android:name=".WearSyncService"
         android:exported="false"
         android:foregroundServiceType="dataSync" />
```

The `pathPrefix` filter ensures only messages intended for this app are delivered, and the `foregroundServiceType="dataSync"` declaration is required by Android 14+ for the offline write service.

## Lessons Learned

**Always send full state.** We initially planned an incremental-only sync protocol, but the complexity of tracking deltas across disconnections wasn't worth it for small datasets. Sending the complete alarm list on every change is simpler, more reliable, and the bandwidth cost is negligible.

**Cache aggressively on the phone side.** The `SharedPreferences` cache that enables offline sync responses adds one line of code to the publish path but eliminates the need to boot a ~200MB Tauri runtime just to answer "what are my alarms?"

**Tauri's plugin system maps well to Android services.** The `@TauriPlugin` / `@Command` pattern gives you a clean Rust-to-Kotlin bridge, and the static `instance` pattern lets Android services (which live outside Tauri's lifecycle) call back into the plugin when they need to.

**Debounce before syncing.** Without the 500ms batch collector, toggling a few alarms in quick succession would fire multiple Bluetooth round-trips. The debounce window is invisible to the user but dramatically reduces unnecessary Data Layer traffic.

**Foreground services can boot Tauri headlessly.** For background writes that need Rust logic, queue first, then boot in a foreground service and drain only after explicit pipeline readiness. The ~1 second runtime boot plus queue replay remains acceptable for background operations.

## Conclusion

Adding Wear OS support to a Tauri Android app is entirely feasible, but it requires stepping outside Tauri's WebView world for the watch app itself. The pattern that works is:

1. Build the watch app as a standalone native Kotlin/Compose project
2. Create a Tauri plugin with Rust + Kotlin layers to bridge the Wear Data Layer
3. Use `DataClient` for phone-to-watch state sync and `MessageClient` for watch-to-phone commands
4. Cache data in `SharedPreferences` for offline scenarios
5. Use a foreground service to boot Tauri headlessly when background processing is needed

The Tauri plugin system's Rust-to-Kotlin bridge makes the phone side surprisingly ergonomic. The main challenge isn't technical — it's architectural: deciding where the boundary between Tauri's world and native Android's world should be, and keeping the sync protocol simple enough to reason about.
