# App Management Plugin (`app-management`)

**Plugin location:** `plugins/app-management/`  
**Status:** Active — mobile lifecycle utilities  
**Platforms:** Android (native), iOS (stubbed)

> This document describes the `app-management` Tauri plugin. For plugin development patterns, see [Plugin Manifest Pattern](plugin-manifest-pattern.md).

## Overview

On mobile platforms (especially Android), standard window management APIs like `minimize` are either unsupported or behave differently than desktop. This plugin provides native lifecycle handling to minimise the app without terminating it.

## Features

- **Minimise app:** Move the app to the background without killing the process.
  - **Android:** Uses `moveTaskToBack(true)` to preserve the Activity stack.
  - **iOS:** Stubbed (no-op) to avoid crashes when invoked.

## API Reference

### `minimize_app`

Minimises the application to the background.

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
- **Permissions:** None currently required.

### iOS

- **Status:** Not implemented (stubbed).
- **Behaviour:** Returns `Ok`/no-op to prevent crashes when called.

## Architecture Guidelines

- **Manifest Injection:** This plugin owns its permissions (if any arise) via `build.rs` using `tauri_plugin::mobile::update_android_manifest()`.
- **Gradle:** Registered via `.android_path(\"android\")` in `build.rs`.
