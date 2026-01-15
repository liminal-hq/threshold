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
