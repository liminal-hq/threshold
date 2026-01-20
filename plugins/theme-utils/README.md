# Tauri Plugin: Theme Utils

This plugin provides native utilities for theming, specifically extracting Material You (Monet) colours from Android devices.

## Purpose

To enable the "Material You" theme integration in the Window Alarm app, allowing the UI to adapt to the user's system wallpaper colours.

## Structure

- `src/lib.rs`: Rust interface exposed to Tauri.
- `src/mobile.rs`: Mobile-specific implementation (calls Java/Kotlin).
- `src/desktop.rs`: Desktop mock/fallback.
- `android/`: Native Android Library module.

## Usage

In your Tauri app:

```rust
// src-tauri/src/lib.rs
.plugin(tauri_plugin_theme_utils::init())
```

```typescript
// Frontend
import { invoke } from '@tauri-apps/api/core';

const colours = await invoke('plugin:theme-utils|get_material_you_colours');
```
