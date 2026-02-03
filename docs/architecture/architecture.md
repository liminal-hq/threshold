# Threshold — Architecture Overview

**Version:** 2.0 (Rust-Core Architecture)
**Last Updated:** January 25, 2026
**Status:** Ready for Implementation

> **📖 For Complete Event System:** See [event-architecture.md](event-architecture.md) for the Level 3 Granular Event System with Revision Tracking (11 semantic events, incremental sync, conflict detection).

---

## Philosophy

This architecture embodies Threshold's core principles:
- **Single source of truth**: SQLite managed by Rust
- **Event-driven coordination**: Plugins react, don't orchestrate
- **Platform independence**: Desktop and Mobile use identical TypeScript
- **Secret sauce protected**: Scheduler algorithm stays in app core
- **Generic plugins**: Could be published to broader Tauri ecosystem

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TypeScript UI Layer                      │
│           (React + MUI - Desktop & Mobile)                 │
│                                                             │
│  • Renders alarm list                                      │
│  • Handles user input                                      │
│  • Invokes Rust commands                                   │
│  • Listens to events for updates                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ invoke('save_alarm')
                       │ listen('alarms:changed')
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 Rust Core (src-tauri/src/)                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │            AlarmCoordinator (alarm/mod.rs)          │  │
│  │  • Single entry point for all alarm operations     │  │
│  │  • Validates inputs                                 │  │
│  │  • Coordinates database + scheduler                 │  │
│  │  • Emits events to plugins                          │  │
│  └────────────┬─────────────────────┬──────────────────┘  │
│               │                     │                      │
│  ┌────────────▼─────────┐  ┌────────▼──────────────────┐  │
│  │  AlarmDatabase       │  │  Scheduler (SECRET SAUCE) │  │
│  │  (alarm/database.rs) │  │  (alarm/scheduler.rs)     │  │
│  │                      │  │                           │  │
│  │  • SQLite operations │  │  • Next trigger calc      │  │
│  │  • CRUD operations   │  │  • Window randomization   │  │
│  │  • Queries           │  │  • Recurrence logic       │  │
│  └──────────────────────┘  └───────────────────────────┘  │
│                                                             │
│  Event Emission: app.emit("alarms:changed", alarms)        │
└──────────────────┬────────────────────┬─────────────────────┘
                   │                    │
         ┌─────────▼──────────┐  ┌──────▼─────────────────────┐
         │  alarm-manager     │  │  wear-sync                 │
         │  (Generic Plugin)  │  │  (Generic Plugin)          │
         │                    │  │                            │
         │  Android:          │  │  Android Only:             │
         │  • AlarmManager    │  │  • Wear Data Layer         │
         │  • Notifications   │  │  • Message handling        │
         │  • Boot receiver   │  │  • State publishing        │
         │  • SharedPrefs     │  │                            │
         │                    │  │  Calls back to Rust:       │
         │  Desktop:          │  │  • invoke('toggle_alarm')  │
         │  • notify-rust     │  │  • invoke('delete_alarm')  │
         │  • Local scheduler │  │                            │
         └────────────────────┘  └────────────────────────────┘
```

---

## Core Components

### 1. Rust Core (src-tauri/src/alarm/)

**Purpose:** Business logic, scheduling algorithms, data persistence

**Key Files:**
```
src-tauri/src/
├── main.rs                      # App entry, plugin registration
├── commands.rs                  # Tauri command handlers
└── alarm/                       # ⭐ CORE BUSINESS LOGIC
    ├── mod.rs                   # AlarmCoordinator
    ├── database.rs              # SQLite operations
    ├── scheduler.rs             # Next trigger calculation (SECRET SAUCE)
    ├── models.rs                # AlarmRecord, AlarmInput, etc.
    └── events.rs                # Event emission helpers
```

**Responsibilities:**
- ✅ Calculate next trigger timestamps (fixed + window)
- ✅ Manage SQLite database
- ✅ Emit `alarms:changed` events when state updates
- ✅ Validate alarm configurations
- ✅ Handle commands from TypeScript and plugins

**Does NOT:**
- ❌ Call platform-specific APIs (AlarmManager, Data Layer)
- ❌ Know about UI frameworks
- ❌ Know about plugins

---

### 2. TypeScript UI Layer (apps/threshold/src/)

**Purpose:** User interface, rendering, user input handling

**Key Changes:**
```typescript
// Legacy (TypeScript handled SQLite directly)
await saveAlarmToSqlite(alarm);
await AlarmManagerService.schedule(alarm);

// NEW (Rust handles everything)
const saved = await invoke<AlarmRecord>('save_alarm', { alarm });
// That's it! Event listeners handle UI updates
```

**Responsibilities:**
- ✅ Render alarm list, edit screens, ringing screen
- ✅ Invoke Rust commands for CRUD operations
- ✅ Listen to `alarms:changed` events and update state
- ✅ Handle navigation

**Does NOT:**
- ❌ Calculate next triggers
- ❌ Manage database directly
- ❌ Call native plugins (except for UI-specific things like sound picker)
- ❌ Know about Wear sync

---

### 3. alarm-manager Plugin (plugins/alarm-manager/)

**Purpose:** Platform-specific alarm scheduling

**Generic Design:** Could be published as `tauri-plugin-alarm-scheduler`

**Event Listener:**
```rust
app.listen("alarms:changed", move |event| {
    let alarms: Vec<AlarmRecord> = serde_json::from_str(event.payload()).unwrap();
    
    #[cfg(target_os = "android")]
    android::sync_to_alarm_manager(alarms);
    
    #[cfg(desktop)]
    desktop::sync_to_scheduler(alarms);
});
```

**Android Implementation:**
- Receives `AlarmRecord[]` from event
- Schedules/cancels via `AlarmManager.setAlarmClock()`
- Maintains SharedPreferences cache for boot recovery
- Launches app when alarm fires

**Desktop Implementation:**
- Schedules notifications via `notify-rust` or similar
- Local timer/scheduler (no system wake guarantee)

**Responsibilities:**
- ✅ React to `alarms:changed` events
- ✅ Schedule platform-specific alarms
- ✅ Handle alarm firing (launch app)
- ✅ Maintain boot recovery cache (Android only)
- ✅ Sound picker UI (Android only)

**Does NOT:**
- ❌ Calculate next triggers
- ❌ Access SQLite database
- ❌ Know about Wear OS

---

### 4. wear-sync Plugin (plugins/wear-sync/)

**Purpose:** Wear OS Data Layer synchronization

**Generic Design:** Could be published as `tauri-plugin-wear-sync`

**Event Listener:**
```rust
#[cfg(target_os = "android")]
app.listen("alarms:changed", move |event| {
    let alarms: Vec<AlarmRecord> = serde_json::from_str(event.payload()).unwrap();
    android::publish_to_data_layer(alarms);
});
```

**Android Implementation:**
- Listens to `alarms:changed` events
- Publishes alarm state to Wear Data Layer
- Receives commands from watch (toggle, delete)
- Calls back to Rust core via `invoke('toggle_alarm', ...)`

**Responsibilities:**
- ✅ React to `alarms:changed` events
- ✅ Publish state to Wear Data Layer
- ✅ Handle watch commands (toggle, delete, create)
- ✅ Convert between Wear format and AlarmRecord

**Does NOT:**
- ❌ Calculate next triggers
- ❌ Access SQLite database
- ❌ Schedule native alarms

---

## Data Flow Examples

### Flow 1: User Creates Alarm (Desktop or Mobile)

```typescript
// 1. User taps "Save" in EditAlarm.tsx
const input: AlarmInput = {
    label: "Wake up",
    enabled: true,
    mode: "WINDOW",
    windowStart: "07:00",
    windowEnd: "07:30",
    activeDays: [1, 2, 3, 4, 5],  // Mon-Fri
    soundUri: "content://media/28",
    soundTitle: "Argon"
};

const saved = await invoke<AlarmRecord>('save_alarm', { alarm: input });
// Navigate away, UI updates via event
```

```rust
// 2. Rust receives command (src-tauri/src/commands.rs)
#[tauri::command]
pub async fn save_alarm<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    alarm: AlarmInput,
) -> Result<AlarmRecord, String> {
    coordinator.save_alarm(&app, alarm).await.map_err(|e| e.to_string())
}

// 3. AlarmCoordinator processes (src-tauri/src/alarm/mod.rs)
impl AlarmCoordinator {
    pub async fn save_alarm<R: Runtime>(...) -> Result<AlarmRecord> {
        // Calculate next trigger (SECRET SAUCE)
        let next_trigger = scheduler::calculate_next_trigger(&alarm)?;
        // Result: 1737885420000 (random time between 7:00-7:30 tomorrow)
        
        // Save to SQLite
        let saved = self.db.save(alarm, next_trigger).await?;
        
        // Emit event to all listeners
        self.emit_alarms_changed(&app).await?;
        
        Ok(saved)
    }
}
```

```rust
// 4. alarm-manager reacts (plugins/alarm-manager/src/lib.rs)
app.listen("alarms:changed", move |event| {
    let alarms: Vec<AlarmRecord> = event.payload();
    
    #[cfg(target_os = "android")]
    {
        for alarm in alarms {
            if let Some(trigger) = alarm.next_trigger {
                android::schedule_alarm(alarm.id, trigger, alarm.sound_uri);
                // Stores to SharedPreferences for boot recovery
            }
        }
    }
});
```

```rust
// 5. wear-sync reacts (plugins/wear-sync/src/lib.rs)
#[cfg(target_os = "android")]
app.listen("alarms:changed", move |event| {
    let alarms: Vec<AlarmRecord> = event.payload();
    android::publish_to_data_layer(alarms);
    // Watch receives update within ~1 second
});
```

```typescript
// 6. TypeScript UI reacts (apps/threshold/src/App.tsx)
useEffect(() => {
    const unlisten = listen<AlarmRecord[]>('alarms:changed', (event) => {
        setAlarms(event.payload);
        // UI re-renders with new alarm
    });
    return () => unlisten.then(fn => fn());
}, []);
```

**Result:** Alarm created, scheduled on device, synced to watch, UI updated. **Single invoke call.**

---

### Flow 2: User Toggles Alarm on Watch

```kotlin
// 1. Watch app sends message (wear-app/src/main/)
val payload = Json.encodeToString(mapOf(
    "id" to 1,
    "enabled" to false
))

messageClient.sendMessage(
    nodeId,
    "/threshold/cmd/alarm_set_enabled",
    payload.toByteArray()
)
```

```kotlin
// 2. wear-sync receives message (plugins/wear-sync/android/)
override fun onMessageReceived(event: MessageEvent) {
    val data = Json.decodeFromString<TogglePayload>(event.data.decodeToString())
    
    // Call back to Rust via invoke
    scope.launch {
        invoke("toggle_alarm", data)
    }
}
```

```rust
// 3. Rust command handler (src-tauri/src/commands.rs)
#[tauri::command]
pub async fn toggle_alarm<R: Runtime>(
    app: AppHandle<R>,
    coordinator: State<'_, AlarmCoordinator>,
    id: i32,
    enabled: bool,
) -> Result<AlarmRecord, String> {
    coordinator.toggle_alarm(&app, id, enabled).await.map_err(|e| e.to_string())
}

// 4. AlarmCoordinator updates (src-tauri/src/alarm/mod.rs)
impl AlarmCoordinator {
    pub async fn toggle_alarm(...) -> Result<AlarmRecord> {
        let mut alarm = self.db.get_by_id(id).await?;
        alarm.enabled = enabled;
        
        // Recalculate or clear trigger
        alarm.next_trigger = if enabled {
            Some(scheduler::calculate_next_trigger(&alarm)?)
        } else {
            None
        };
        
        self.db.update(alarm).await?;
        self.emit_alarms_changed(&app).await?;
        
        Ok(alarm)
    }
}
```

```rust
// 5. alarm-manager reacts to event
// Cancels or reschedules native alarm

// 6. wear-sync reacts to event
// Publishes updated state back to watch

// 7. TypeScript UI reacts to event
// Shows alarm as disabled
```

**Result:** Watch command → Rust update → Event broadcast → All surfaces sync. **No duplication.**

---

### Flow 3: Boot Recovery (Android Only)

```kotlin
// 1. Device boots, BootReceiver fires
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Can't launch app, can't call Tauri commands
        // Use cached data from SharedPreferences
        
        val alarms = AlarmUtils.loadAllFromPrefs(context)
        for (id, trigger, soundUri) in alarms) {
            if (trigger > System.currentTimeMillis()) {
                AlarmUtils.scheduleAlarm(context, id, trigger, soundUri)
            }
        }
    }
}
```

**Why this works:**
- alarm-manager maintains SharedPreferences cache on every `alarms:changed` event
- Boot receiver reads cache (no app launch needed)
- When app eventually launches, Rust re-validates from SQLite

**Future enhancement:** App could launch in background on boot to sync from SQLite, but not required.

---

## Key Architectural Decisions

### Decision 1: Rust Core, Not Plugin

**Rationale:**
- Scheduler algorithm is Threshold's competitive advantage
- Should not be easily extractable
- No overhead of plugin lifecycle
- Direct access for all commands

**Trade-off:** Can't publish alarm core separately (but that's the point).

---

### Decision 2: Event-Driven Plugin Coordination

**Rationale:**
- Plugins don't need to know about each other
- Easy to add new listeners (e.g., future cloud sync plugin)
- Single emit point (AlarmCoordinator)

**Trade-off:** Can't directly await plugin completion (but emit returns immediately anyway).

---

### Decision 3: SharedPreferences Cache for Boot

**Rationale:**
- Boot receiver can't launch app on some Android versions
- SharedPreferences survives boot
- Minimal duplication (just id + trigger + sound)

**Trade-off:** Cache can become stale if SharedPreferences corrupted (mitigated by app re-syncing on launch).

---

### Decision 4: Generic Plugins

**Rationale:**
- alarm-manager could work for any alarm app
- wear-sync could work for any Wear-enabled app
- Easier to maintain when separate from core logic

**Trade-off:** Slightly more boilerplate (event listeners instead of direct calls).

---

## Platform Differences

| Feature | Android | Desktop | Wear OS |
|---------|---------|---------|---------|
| **Alarm Scheduling** | AlarmManager.setAlarmClock() | notify-rust (no wake) | N/A (syncs from phone) |
| **Boot Recovery** | BootReceiver + SharedPrefs | N/A | N/A |
| **Sound Picker** | Native RingtonePickerActivity | File picker | N/A |
| **Ringing UI** | Full-screen Activity + notification | Dedicated Ring window + notification | Watch vibration + complication |
| **Wake from Sleep** | ✅ Guaranteed | ❌ Not reliable | ✅ Via phone |
| **Data Sync** | Local SQLite | Local SQLite | Wear Data Layer from phone |

---

## Security Considerations

### Data at Rest
- SQLite database stored in app-private directory
- No encryption (alarms are not sensitive data)
- SharedPreferences also app-private

### Data in Transit (Wear Sync)
- Wear Data Layer scoped to app package name + signing key
- Only apps with same signature can access data
- No additional authentication needed

### Permissions Required
- Android: `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
- Desktop: None (local notifications)
- Wear: None (Data Layer is automatic for paired apps)

---

## Testing Strategy

### Unit Tests (Rust)
```rust
// Test scheduler logic
#[test]
fn test_window_randomization() {
    let input = AlarmInput {
        mode: AlarmMode::Window,
        window_start: Some("07:00".into()),
        window_end: Some("07:30".into()),
        active_days: vec![1, 2, 3, 4, 5],
        enabled: true,
        ..Default::default()
    };
    
    let trigger = calculate_next_trigger(&input).unwrap().unwrap();
    
    // Assert within window (convert to time of day)
    let trigger_time = /* extract time */;
    assert!(trigger_time >= "07:00");
    assert!(trigger_time <= "07:30");
}
```

### Integration Tests
- Create alarm via TypeScript → Verify SQLite record
- Toggle alarm via Wear command → Verify all surfaces update
- Boot receiver → Verify alarms rescheduled

### Manual Testing Checklist
- [ ] Desktop: Create alarm, verify notification appears
- [ ] Android: Create alarm, verify AlarmManager scheduled
- [ ] Android: Reboot device, verify alarm survives
- [ ] Wear: Toggle alarm, verify phone updates
- [ ] Wear: Delete alarm, verify removed everywhere
- [ ] Cross-platform: Edit same alarm on phone and watch while offline

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Save alarm (TS → Rust → SQLite) | < 50ms | Benchmark |
| Event emission (Rust → plugins) | < 5ms | Benchmark |
| Wear sync latency (phone → watch) | < 2s | Manual timing |
| Boot recovery (all alarms) | < 500ms | adb logcat timing |
| UI update after toggle | < 100ms | Visual perception |

---

## Migration Notes

**Current Users:** None (testers can reinstall)

**Fresh Install Flow:**
1. App starts
2. Rust initializes SQLite database (creates tables)
3. No alarms exist
4. User creates first alarm
5. Event system begins working

**No migration code needed.** 🎉

---

## Next Steps

1. **Read**: `implementation-roadmap.md` for build plan
2. **Review**: `data-architecture.md` for schemas
3. **Code**: Start with Milestone A (Rust Core)
4. **Test**: Unit tests for scheduler logic
5. **Iterate**: Add alarm-manager event listener
6. **Ship**: Wear sync as final milestone

---

**This architecture is production-ready and scalable. Let's build it! 🚀**
