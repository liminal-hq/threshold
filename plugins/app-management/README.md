# Tauri Plugin: App Management

This plugin provides native app management capabilities, primarily focused on handling application lifecycle events that are not fully exposed by the standard web or desktop APIs on mobile platforms.

## Purpose

To allow the application to programmatically minimize itself to the background on Android (`moveTaskToBack`), emulating the behavior of the Home button. This is essential for custom "Dismiss" flows where the app should not fully close but just vanish from the foreground.

## Structure

- `src/lib.rs`: Rust interface exposed to Tauri.
- `src/mobile.rs`: Mobile-specific implementation (calls Java/Kotlin).
- `src/desktop.rs`: Desktop no-op implementation.
- `android/`: Native Android Library module.

## Usage

In your Tauri app:

```rust
// src-tauri/src/lib.rs
.plugin(tauri_plugin_app_management::init())
```

```typescript
// Frontend
import { invoke } from '@tauri-apps/api/core';

// Minimize the app (Android: moveTaskToBack, Desktop: no-op/handled by window)
await invoke('plugin:app-management|minimize_app');
```

## Permissions

Default permissions are available in `permissions/default.toml`.

- `allow-minimize-app`: Grants access to the `minimize_app` command.
