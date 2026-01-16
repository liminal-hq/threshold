# TODO

## Technical Debt

- [ ] Migrate SQLite database to use explicit `appDataDir()` path instead of default path
  - Currently uses `Database.load('sqlite:alarms.db')` with default location
  - Should use `appDataDir()` for explicit platform-specific path control
  - Ensures consistency with settings storage pattern (which uses `appConfigDir()`)
  - Platform paths: `~/.local/share/<bundle-id>/` (Linux), `~/Library/Application Support/<bundle-id>/` (macOS), etc.

## Features / Data Model**
  - [ ] Enhance SQLite schema with `native_id` column to support robust deduplication of alarms imported from Android Intents (currently deduplicated by label + time).
  - [ ] Implement `AlarmManagerService` logic to check `native_id` during import.

- **UI / UX**
  - [ ] Implement Sound Picker (requires native plugin to list system ringtones).
  - [ ] Add Floating Window support for Desktop ringing experience.
