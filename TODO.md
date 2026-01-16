# TODO

- **Infrastructure / Data Model**
  - [ ] Enhance SQLite schema with `native_id` column to support robust deduplication of alarms imported from Android Intents (currently deduplicated by label + time).
  - [ ] Implement `AlarmManagerService` logic to check `native_id` during import.

- **UI / UX**
  - [ ] Implement Sound Picker (requires native plugin to list system ringtones).
  - [ ] Add Floating Window support for Desktop ringing experience.
