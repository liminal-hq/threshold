# Mobile App Management Plugin

**Plugin Name:** `tauri-plugin-app-management`  
**Purpose:** Handle platform-specific lifecycle management for mobile applications (Android/iOS) that are not covered by the standard Tauri Window API.

## Overview

On mobile platforms (especially Android), the standard window management APIs (like `minimize`, `maximize`) often behave differently or are unsupported compared to desktop environments. This plugin provides native implementations for these lifecycle events.

## Features

- **Minimize App:** Programmatically move the app to the background (without killing the process).
  - **Android:** Uses `moveTaskToBack(true)` to preserve the Activity stack.
  - **iOS:** (Future) Stubbed for now.

## API Reference

### `minimize()`

Minimizes the application to the background.

```typescript
import { invoke } from '@tauri-apps/api/core';

export async function minimizeApp(): Promise<void> {
	await invoke('plugin:app-management|minimize_app');
}
```

## Implementation Details

### Android

- **Class:** `com.plugin.app_management.AppManagementPlugin`
- **Method:** `moveTaskToBack(true)`
- **Permissions:** None explicitly required for `moveTaskToBack`, but the plugin follows the Manifest Injection Pattern for future extensibility.

### iOS

- **Status:** Not implemented (Stubbed).
- **Behavior:** Returns `Ok` or no-op to prevent crashes if called.

## Architecture Guidelines

- **Manifest Injection:** This plugin owns its permissions (if any arise) via `build.rs` using `tauri_plugin::mobile::update_android_manifest()`.
- **Gradle:** Registered via `.android_path("android")` in `build.rs`.
