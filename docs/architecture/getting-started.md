# Getting Started — Threshold Implementation

**Quick Start Guide**  
**Updated:** January 25, 2026

---

## Prerequisites

Before starting Milestone A, ensure you have:

### Development Environment
- ✅ Rust stable (1.70+) installed
- ✅ Node.js 20+ and pnpm installed
- ✅ Android Studio with Android SDK
- ✅ Android NDK r28+ (for Google Play compliance)
- ✅ VS Code with dev container (recommended)

### Codebase Familiarity
- ✅ Read `README.md` and `SPEC.md`
- ✅ Read `AGENTS.md` (Canadian spelling, commit conventions)
- ✅ Understand current architecture (Rust alarm core + AlarmService)
- ✅ Familiar with Tauri v2 plugin system

---

## Architecture Documents

Read these in order:

1. **`architecture.md`** - High-level system design
   - Understand Rust core vs plugins
   - Event-driven coordination
   - Platform differences

2. **`implementation-roadmap.md`** - Step-by-step build plan
   - Milestone A: Rust Core (start here!)
   - Milestone B: TypeScript Migration
   - Milestone C: Event-Driven alarm-manager
   - Milestone D: wear-sync Plugin
   - Milestone E: Wear OS App

3. **`data-architecture.md`** - Data models and flows
   - SQLite schema
   - Event payloads
   - Wear synchronization protocol

---

## Milestone A: Quick Start

**Goal:** Build Rust core with scheduler and database

**Estimated Time:** 3-4 days

### Step 1: Create File Structure

```bash
cd threshold/src-tauri/src
mkdir alarm
touch alarm/{mod.rs,database.rs,scheduler.rs,models.rs,events.rs,error.rs}
```

### Step 2: Add Dependencies

Edit `src-tauri/Cargo.toml`:
```toml
[dependencies]
tauri = { version = "2.0", features = ["..existing.."] }
tauri-plugin-sql = { version = "2.0", features = ["sqlite"] }
chrono = { version = "0.4", features = ["serde"] }
rand = "0.8"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
log = "0.4"
```

### Step 3: Follow Implementation Roadmap

Open `implementation-roadmap.md` and start with:
- **Task A2:** Define models (`models.rs`)
- **Task A3:** Implement scheduler (`scheduler.rs`)
- **Task A4:** Implement database (`database.rs`)
- **Task A5:** Implement coordinator (`mod.rs`)
- **Task A6:** Create commands (`commands.rs`)
- **Task A7:** Update main entry point

### Step 4: Test as You Go

```bash
cd src-tauri
cargo test
```

Expected output:
```
running 3 tests
test alarm::scheduler::tests::test_disabled_alarm ... ok
test alarm::scheduler::tests::test_fixed_alarm_calculation ... ok
test alarm::scheduler::tests::test_window_randomization ... ok
```

### Step 5: Test from TypeScript

Open browser DevTools console:
```javascript
// Test Rust commands
await window.__TAURI__.core.invoke('get_alarms')
// Expected: []

await window.__TAURI__.core.invoke('save_alarm', {
    alarm: {
        enabled: true,
        mode: 'FIXED',
        fixedTime: '09:00',
        activeDays: [1, 2, 3, 4, 5]
    }
})
// Expected: { id: 1, nextTrigger: <timestamp>, ... }

await window.__TAURI__.core.invoke('get_alarms')
// Expected: [{ id: 1, ... }]
```

---

## Development Workflow

### Running the App

**Desktop:**
```bash
pnpm dev:desktop
```

**Android:**
```bash
pnpm dev:android
```

**Debugging Rust:**
```bash
# Enable Rust logs
RUST_LOG=debug pnpm dev:desktop

# Android logs
adb logcat -s threshold:* AlarmManager:* Tauri/Console:*
```

### Code Style

**Rust:**
```bash
cd src-tauri
cargo fmt
cargo clippy
```

**TypeScript:**
```bash
pnpm format
pnpm lint
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feat/milestone-a-rust-core

# Commit with conventional commits
git commit -m "feat(alarm): add scheduler module with window randomization"
git commit -m "test(alarm): add unit tests for scheduler"
git commit -m "refactor(alarm): extract database operations to separate module"

# Push and create PR
git push origin feat/milestone-a-rust-core
```

---

## Common Issues

### Issue: `tauri-plugin-sql` not found

**Solution:** Make sure you have the plugin in dependencies:
```toml
tauri-plugin-sql = { version = "2.0", features = ["sqlite"] }
```

### Issue: Event not firing

**Debug:**
```rust
app.emit("alarms:changed", &alarms)?;
log::info!("Emitted alarms:changed with {} alarms", alarms.len());
```

```typescript
listen('alarms:changed', (event) => {
    console.log('Received alarms:changed:', event.payload);
});
```

### Issue: SQLite migration not running

**Solution:** Ensure migrations are added in `main.rs`:
```rust
.plugin(
    tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:alarms.db", alarm::database::migrations())
        .build()
)
```

---

## Testing Checklist (Milestone A)

Before moving to Milestone B, verify:

- [ ] `cargo test` passes all tests
- [ ] Commands callable from TypeScript DevTools
- [ ] SQLite database created at correct path
- [ ] `get_alarms` returns empty array initially
- [ ] `save_alarm` creates record with `next_trigger` calculated
- [ ] `toggle_alarm` updates enabled status and recalculates trigger
- [ ] `delete_alarm` removes record
- [ ] Events emit (check browser console)
- [ ] No regressions (app still runs normally)

---

## Next Steps After Milestone A

1. **Read Milestone B** in `implementation-roadmap.md`
2. **Create AlarmService.ts** wrapper for Rust commands
3. **Update screens** to use new service
4. **Confirm legacy database service removal (completed)**
5. **Test thoroughly** on both desktop and Android

---

## Getting Help

**If stuck:**
1. Review the architecture docs again
2. Check `AGENTS.md` for coding conventions
3. Look at existing Tauri plugin code for patterns
4. Test incrementally (don't write everything at once)

**Remember:**
- Start small (one file at a time)
- Test frequently (`cargo test`, DevTools console)
- Follow the roadmap step-by-step
- Canadian spelling everywhere! 🇨🇦

---

## Resources

### Tauri Documentation
- [Tauri v2 Guide](https://v2.tauri.app/)
- [Plugin Development](https://v2.tauri.app/develop/plugins/)
- [tauri-plugin-sql](https://github.com/tauri-apps/tauri-plugin-sql)

### Rust Documentation
- [Chrono crate](https://docs.rs/chrono/)
- [Serde JSON](https://docs.rs/serde_json/)
- [Tokio async runtime](https://tokio.rs/)

### Android Wear
- [Wear OS Data Layer](https://developer.android.com/training/wearables/data/data-layer)
- [MessageClient API](https://developers.google.com/android/reference/com/google/android/gms/wearable/MessageClient)

---

**Ready to build? Start with Milestone A! 🚀**
