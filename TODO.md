# TODO

## Brand

- [ ] Create Website at threshold.liminalhq.ca
- [ ] Create Play Store Feature Graphics
- [ ] Write Privacy Policy
- [ ] Investigate Material You Dynamic Theming Integration

## Technical Debt

- [ ] Migrate SQLite database to use explicit `appDataDir()` path instead of default path
  - Currently uses `Database.load('sqlite:alarms.db')` with default location
  - Should use `appDataDir()` for explicit platform-specific path control
  - Ensures consistency with settings storage pattern (which uses `appConfigDir()`)
  - Platform paths: `~/.local/share/<bundle-id>/` (Linux), `~/Library/Application Support/<bundle-id>/` (macOS), etc.

- [ ] **Implement centralized logging provider**
  - Replace scattered `console.log` calls with a unified logging service
  - Support different log levels (debug, info, warn, error)
  - Enable/disable verbose logging per module
  - Consider using Tauri's `tauri-plugin-log` for native log forwarding
  - Benefit: Easier debugging across Kotlin, Rust, and TypeScript boundaries

- [ ] **Create shared type definitions for cross-platform events**
  - Define event payload types in a central location (e.g., `shared-types.ts`)
  - Document which native code emits each event type
  - Example: `AlarmRingEvent { id: number }` used by `AlarmManagerPlugin.kt` and `alarm_manager.rs`
  - Prevents type mismatches between native event emitters and TypeScript listeners
  - Consider JSON Schema or TypeScript types with JSDoc for Kotlin/Swift reference

## Features / Data Model
  - [ ] Enhance SQLite schema with `native_id` column to support robust deduplication of alarms imported from Android Intents (currently deduplicated by label + time).
  - [ ] Implement `AlarmManagerService` logic to check `native_id` during import.

- **UI / UX**
  - [ ] Implement Sound Picker (requires native plugin to list system ringtones).
  - [ ] Add Floating Window support for Desktop ringing experience.
  - [ ] Add "Undo" snackbar after deletion to mitigate accidental swipes.
