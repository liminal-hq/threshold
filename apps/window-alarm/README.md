# Window Alarm App

This directory contains the main Tauri v2 application.

## Tech Stack

- **Framework:** Tauri v2
- **Frontend:** React + TypeScript + Ionic Framework
- **State/Logic:** Custom Hooks + SQLite (`tauri-plugin-sql`)
- **Native Integration:** `tauri-plugin-alarm-manager` (Local plugin)

## Directory Structure

- `src/`: React Source Code
  - `screens/`: Page components (Home, Edit, Ringing)
  - `components/`: Reusable UI components
  - `services/`: Business logic singletons
  - `theme/`: Global styles and variables
- `src-tauri/`: Rust Host Application

## Commands

### Build

```bash
pnpm tauri build
```

### Test

```bash
# Run frontend tests (if configured)
pnpm test
```

## Mobile Development

Ensure you have your Android device connected or Emulator running.

```bash
pnpm tauri android init
pnpm tauri android dev
```

## Desktop Development

To run the application in desktop mode (Linux/macOS/Windows):

```bash
cd apps/window-alarm
pnpm tauri dev
```

## Debugging

### Console Logging

By default, Tauri filters frontend logs. To ensure `console.log`, `console.info`, etc. are visible in the terminal:

1. Open `src-tauri/src/lib.rs`.
2. Locate the `tauri_plugin_log` configuration in the setup hook.
3. Ensure the level is set to `log::LevelFilter::Trace` (or `Debug`).

```rust
tauri_plugin_log::Builder::default()
    .level(log::LevelFilter::Trace) // Use Trace or Debug for full visibility
    .build(),
```
