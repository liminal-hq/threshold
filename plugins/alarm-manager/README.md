# Tauri Plugin: Alarm Manager

This plugin bridges the Tauri webview to the native Android `AlarmManager` API.

## Purpose

To provide reliable, exact alarm scheduling that wakes the device from Doze mode, which standard Web APIs cannot do.

## Structure

- `src/lib.rs`: Rust interface exposed to Tauri.
- `src/mobile.rs`: Mobile-specific implementation (calls Java/Kotlin).
- `src/desktop.rs`: Desktop mock/fallback.
- `android/`: Native Android Library module. See [android/README.md](android/README.md) for details.

## Usage

In your Tauri app:

```rust
// src-tauri/src/lib.rs
.plugin(tauri_plugin_alarm_manager::init())
```

```typescript
// Frontend
import { invoke } from '@tauri-apps/api/core';

await invoke('plugin:alarm-manager|schedule', {
	payload: { 
        id: 1, 
        triggerAt: 1715000000000,
        soundUri: 'content://media/internal/audio/media/12', // Optional
    },
});

// Pick a sound
const sound = await invoke('plugin:alarm-manager|pick_alarm_sound', {
   existingUri: null,
   title: 'Select Alarm Sound',
   showSilent: true,
   showDefault: true
});
```
