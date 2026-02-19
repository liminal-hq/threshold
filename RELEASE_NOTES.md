# Release Notes

This document tracks all releases of the Threshold application.

---

## Version 0.1.7

**Release Date:** February 19, 2026  
**Status:** Released

> [!IMPORTANT]
> Version `0.1.6` was superseded by `0.1.7` due to a Wear OS versionCode collision risk. Use `0.1.7` as the canonical release for this cycle.

> [!NOTE]
> This release window includes substantial platform work since `0.1.5`: Wear OS companion delivery, event-driven sync architecture, alarm pipeline refactoring, upcoming reminder actions, and release tooling improvements.

### ✨ New Features

**Wear OS Companion App**

- Shipped the Wear OS companion app with alarms list, edit/toggle flows, and mobile-linked synchronisation
- Added Tile + Complication support for next-upcoming alarm visibility
- Applied Material You dynamic accent support with static fallback
- Added branded launcher icon integration for the watch app
- Included release/build integration for Wear in the release tooling

**Wear Sync Plugin and Sync Protocol**

- Implemented full Wear sync plugin foundation across Kotlin and Rust bridges
- Added incremental sync protocol with monotonic revisions
- Added conflict detection for stale writes and per-alarm revision validation
- Added offline write queueing and replay for disconnected scenarios
- Added full sync payload support, lifecycle signalling, and queue readiness coordination

**Alarm Platform Architecture**

- Implemented Rust core alarm scheduler with window randomisation
- Added Rust SQLite alarm data layer and coordinator wiring
- Implemented `AlarmService` and migrated UI away from legacy data service patterns
- Removed legacy `DatabaseService` in favour of unified service paths
- Added Android boot recovery and event-driven scheduler architecture updates

**Upcoming Reminder Actions**

- Added Android upcoming notification actions for snooze and dismiss
- Added upcoming alarm scheduling with label/window-aware copy
- Added Android toast plugin integration for action feedback
- Fixed startup rehydration and snooze action label refresh behaviour

### 🐛 Bug Fixes

**Wear Sync and App Reliability**

- Fixed stale write rejection, launch argument parsing, and Kotlin mobile init fallback safety
- Fixed alarm tap dispatch, crown rotary scrolling, and tile/complication selection edge cases
- Fixed modern Wear message intent filter usage and plugin permission schema duplication
- Hardened stale toggle recovery and cold-boot behaviour

**Build and Release Tooling**

- Added interactive release version TUI for phone + Wear lockstep updates
- Added keyboard and mouse-driven TUI controls, terminal resize redraw handling, and improved UX flow
- Added `pnpm build:release` wrapper for release devcontainer builds
- Updated release versioning logic to avoid Wear/phone versionCode collisions:
  - `phoneVC = M*1,000,000 + m*1,000 + p`
  - `watchVC = phoneVC + 1,000,000,000`

### 📚 Documentation and Testing

- Added and updated Wear companion architecture, setup, troubleshooting, and testing documentation
- Reorganised and normalised documentation structure with clearer references
- Added Mermaid linting and CI annotations for diagram quality
- Added Wear app unit tests and CI integration
- Expanded wear-sync tests for sync/conflict and queue behaviour

### 📝 Technical Details

**Major PRs Merged (selected):**

- [#98](https://github.com/liminal-hq/threshold/pull/98) - Add Wear OS Watch Companion App
- [#154](https://github.com/liminal-hq/threshold/pull/154) - Complete Wear OS companion support
- [#130](https://github.com/liminal-hq/threshold/pull/130) - Wear-sync scaffold, BatchCollector, and Kotlin stubs
- [#129](https://github.com/liminal-hq/threshold/pull/129) - Implement granular event system with monotonic revisions
- [#110](https://github.com/liminal-hq/threshold/pull/110) - Event-driven architecture and Android boot recovery
- [#106](https://github.com/liminal-hq/threshold/pull/106) - Migrate UI to AlarmService and event-driven architecture
- [#105](https://github.com/liminal-hq/threshold/pull/105) - Implement AlarmService and types
- [#103](https://github.com/liminal-hq/threshold/pull/103) - Implement AlarmCoordinator and Tauri wiring
- [#101](https://github.com/liminal-hq/threshold/pull/101) - Implement Rust SQLite database layer
- [#99](https://github.com/liminal-hq/threshold/pull/99) - Implement alarm scheduler logic in Rust core
- [#145](https://github.com/liminal-hq/threshold/pull/145) - Add upcoming snooze action with next-occurrence scope
- [#147](https://github.com/liminal-hq/threshold/pull/147) - Fix upcoming reminder rehydration and snooze action label refresh
- [#160](https://github.com/liminal-hq/threshold/pull/160) - Modernize release version TUI and add release build shortcut

**Release and Follow-up Issues:**

- [#161](https://github.com/liminal-hq/threshold/issues/161) - Release TUI should create a dedicated version bump commit before tagging

**Commit/Contributor Summary (`0.1.5` → `0.1.7`):**

- **Commits:** 166
- **Merged PRs:** 22
- **Contributors:** Scott Morris, google-labs-jules[bot]

---

## Version 0.1.5

**Release Date:** February 7, 2026  
**Status:** Released

> [!NOTE]
> This release introduces a major visual refresh with the new hybrid Material-Liminal design for the ringing screen, adds mobile app management capabilities, and improves documentation and landing page messaging.

### ✨ New Features

**Hybrid Material-Liminal Ringing Screen**

- Complete visual redesign of the ringing screen with breathing rings and threshold indicator
- Reactive settings integration: 24-hour format, snooze length, and silence-after settings update live
- Stabilised time display to prevent AM/PM flashing and format inconsistencies
- Refined mobile layout with improved spacing, button sizing, and time placement
- Hardened desktop window behaviour to prevent duplicate windows and ensure consistent sizing
- Improved drag regions and window state management on desktop

**Mobile App Management Plugin**

- New `tauri-plugin-app-management` for graceful app minimisation on mobile
- Implements Android `moveTaskToBack(true)` for proper background behaviour
- Created `AppManagementService` wrapper for TypeScript integration
- Alarm dismiss flow now properly minimises app on Android (matches Home button behaviour)
- iOS stub implementation with proper build configuration
- Comprehensive plugin documentation in `docs/APP_MANAGEMENT.md`

**Landing Page Refresh**

- Refreshed site landing page with updated messaging and layout
- Clarified product positioning for new visitors
- Surfaced open-source path and release details prominently
- Improved mobile menu and theme persistence
- Enhanced conversion path for downloads and code exploration

### 🐛 Bug Fixes

**Ringing Screen Stability**

- Fixed concurrent alarm ring handling with flattened ringing glow selector
- Prevented duplicate ringing windows on desktop
- Cleaned up stale windows before creating new ones
- Ensured window sizing and drag regions behave consistently
- Avoided window state caching issues

**Build System**

- Fixed app-management plugin build.rs compilation errors
- Resolved type inference issues with permissions vector
- Fixed compiler warnings for unused imports
- Updated Cargo.lock with new plugin dependencies

### 🧪 Testing

**Test Coverage Additions**

- Added `AppManagementService` mocks to Ringing screen tests
- Verified `minimizeApp` is called instead of raw window minimise on mobile
- Added `SettingsService.getIs24h` and `window.setSize` mocks
- Unit tests for plugin error serialisation and initialisation

### 📚 Documentation

**README Updates**

- Rewrote README with Threshold's **calm computing** philosophy
- Highlighted **Random Window** core feature prominently
- Added comprehensive **Tech Stack** section (Tauri v2, React 19, MUI, TanStack Router, SQLite, Kotlin)
- Added missing workspace entries: `apps/site`, `plugins/app-management`, `plugins/theme-utils`, `plugins/time-prefs`
- Expanded **Features** section with key capabilities
- Added **Testing** and **Formatting** sections for contributors
- Updated `adb logcat` command with current plugin tags
- Removed outdated Ionic Framework references

**Plugin Documentation**

- Created comprehensive `docs/APP_MANAGEMENT.md`
- Documented `moveTaskToBack` rationale for mobile minimisation
- Included structure overview, usage examples, and permissions
- Added shell interpolation safety guidance for commit messages

### 🔧 Configuration & Refactoring

**Plugin Architecture**

- Consolidated app-management permissions into `default.toml`
- Removed unnecessary iOS implementation scaffolding
- Cleaned up autogenerated guest JS bindings (using direct `invoke` instead)
- Removed example Tauri app and JS build configuration
- Added generated permission schemas for build consistency
- Registered plugin in `lib.rs` and added `app-management:default` capability

**Code Quality**

- Converted mobile spacing to rem units for better scaling
- Improved type safety with explicit type annotations
- Fixed compiler warnings via `cargo fix`
- Aligned alarm wording with Canadian spelling

### 📝 Technical Details

**Major PRs Merged:**

- [#133](https://github.com/liminal-hq/threshold/pull/133) - Update Ringing Screen with New Hybrid Material Liminal Design
- [#134](https://github.com/liminal-hq/threshold/pull/134) - Refresh landing page messaging and mobile navigation behaviour
- [#128](https://github.com/liminal-hq/threshold/pull/128) - Update README with project philosophy, tech stack, and missing content
- [#127](https://github.com/liminal-hq/threshold/pull/127) - Add mobile app management plugin

**Issues Resolved:**

- [#126](https://github.com/liminal-hq/threshold/issues/126) - Mobile app management plugin
- [#131](https://github.com/liminal-hq/threshold/issues/131) - Hybrid material liminal design for ringing screen

**Commits:** 24 commits since v0.1.4  
**Contributors:** Scott Morris

### ✅ Verification

- [x] **Ringing Screen**: New hybrid design renders correctly on desktop and mobile
- [x] **Settings Integration**: Live settings updates working in ringing window
- [x] **App Management**: Alarm dismiss properly minimises app on Android
- [x] **Build**: All TypeScript and Rust tests passing
- [x] **Documentation**: README and plugin docs updated and accurate

---

## Version 0.1.4

**Release Date:** February 3, 2026  
**Status:** Released

> [!NOTE]
> This release focuses on critical window alarm fixes, event log diagnostics, build system improvements, and theme enhancements.

### ✨ New Features

**Event Log Export**

- Added event log downloader for desktop and Android platforms
- Backend Tauri command to bundle app log files
- Settings action to download event logs for diagnostics
- Android save dialog support via filesystem plugin
- Automatic export directory creation and file URI normalisation
- Log size capping with preference for newest files
- Improved log signal by routing `console.log` to info level
- Reduced noisy mobile targets for cleaner logs

**Theme Improvements**

- Default theme now follows system preference (Material You enabled by default)
- New installs automatically use system palette
- Improved first-run experience with sensible theme defaults

### 🐛 Bug Fixes

**Window Alarm Fixes** (Critical)

- **Fixed window alarm re-ring bug** (#111, #120): Window alarms could re-arm within the same window after firing, creating "zombie alarms"
- Added `lastFiredAt` tracking to alarm model with SQLite schema migration
- Window alarms now properly skip re-arming if already fired in the current window
- Missed window alarms (when app was closed) now correctly treated as fired
- Guard against same-window re-rings during reschedule operations
- Added comprehensive test coverage for same-day and overnight window skips

**Scheduler Improvements**

- Window triggers now align to minute boundaries for clearer user expectations
- Randomization occurs over minute-aligned times within the window
- Added second-level alignment test coverage
- Fixed active day expectations after skipping fired windows

**Build System Fixes**

- Resolved TypeScript and Rust compiler warnings to prevent build failures
- Fixed invalid regex escape sequences in ringing path matching
- Ensured `@threshold/core` builds before app to prevent stale type definitions
- Added prebuild hooks for desktop and Android to keep core dist fresh
- Implemented source conditional exports to avoid stale dist artefacts
- Preserved fast dev flow with source resolution

**Logging Improvements**

- Removed event log size cap to ensure full file contents in exports
- Added trace logging for ringing entry and alarm-ring receipt
- Improved visibility into window re-arm decisions during field testing
- Log migration presence for field validation

### 🧪 Testing

**Test Coverage Additions**

- Added `AlarmManagerService` tests for fired alarm handling
- Covered ringing-route init and pending fired reschedule behaviour
- Added window skip tests for same-day and overnight scenarios
- Added unit tests for log truncation helper
- Fixed active day expectation in scheduler tests

### 📚 Documentation

- Documented event log downloader in desktop app README
- Added inline documentation for window alarm behaviour
- Improved code comments for migration visibility

### 🔧 Configuration & Refactoring

**Build System**

- Source conditional exports for `@threshold/core` entry points
- Enabled source condition in app TypeScript and Vite resolution
- Prebuild hooks ensure core builds before packaged builds
- Removed unused mut warning in log setup

**Code Quality**

- Proper regex literals for path matching
- Typed test payloads for better type safety
- Removed unreachable code paths in mobile logger setup
- Ensured reschedule uses defined trigger types

### 📝 Technical Details

**Major PRs Merged:**

- [#123](https://github.com/liminal-hq/threshold/pull/123) - Add event log downloader and improve logger
- [#120](https://github.com/liminal-hq/threshold/pull/120) - Prevent window re-ring after firing

**Issues Closed:**

- [#122](https://github.com/liminal-hq/threshold/issues/122) - Window triggers should align to minutes
- [#111](https://github.com/liminal-hq/threshold/issues/111) - Window alarms re-ring after firing

**Commits:** 19 commits since v0.1.3  
**Contributors:** Scott Morris

### ✅ Verification

- [x] **Window Alarms**: Verified no re-ring after firing in same window
- [x] **Event Logs**: Export functionality tested on desktop and Android
- [x] **Build**: All TypeScript and Rust warnings resolved
- [x] **Tests**: All automated tests passing
- [x] **Theme**: System palette defaults working correctly

---

## Version 0.1.3

**Release Date:** January 28, 2026  
**Status:** Released

> [!NOTE]
> This release focuses on alarm customization, UI/UX improvements, and establishing automated testing infrastructure.

### ✨ New Features

**Custom Alarm Sounds**

- Added alarm sound picker to Edit Alarm screen
- Desktop support for custom alarm sounds with file selection
- Mobile support for selecting sounds from device storage
- Sound preview functionality before saving
- Persistent storage of custom sound preferences per alarm

**Interactive Snooze Notifications**

- Implemented snooze notification reminders on Android
- Notifications display remaining snooze time
- Tap notification to return to alarm screen
- Integrated with alarm settings (snooze length, silence after)

**Mobile UI Improvements**

- Created reusable `MobileToolbar` component for consistent headers
- Moved Settings to overflow menu on Home screen
- Standardized toolbar actions across Home, Settings, and Edit Alarm screens
- Improved safe-area padding handling

### 🐛 Bug Fixes

**Ringing Screen**

- Fixed button colours not matching theme on mobile (Material You/Built-in themes now work correctly)
- Removed duplicate `ThemeProvider` logic that caused theme inconsistencies
- Fixed white button rendering issue on mobile
- Removed tap highlight flash effect on Android
- Improved desktop window transparency handling with CSS classes
- Fixed desktop dismiss behaviour to close window instead of navigating back
- Removed global pointer cursor (now only shows on interactive elements)

**Desktop Fixes**

- Resolved undefined alarm ID issue on desktop
- Fixed theme creation in `Ringing.tsx`
- Improved window close behaviour for ringing alarms

**Testing Infrastructure**

- Fixed missing jest-dom types in Vitest environment
- Configured jest-dom correctly for Vitest
- Stabilized Ringing tests with proper cleanup and async handling
- Updated theme tests to match current implementation

### 🧪 Testing & CI/CD

**Automated Testing**

- Added comprehensive unit tests for Ringing screen (dismissal, snooze, navigation)
- Added tests for `AlarmSoundPickerService` with proper mocking
- Created Cargo workspace for standardized Rust testing
- Configured nextest for Rust test execution

**CI/CD Workflows**

- Added `.github/workflows/test.yml` for automated PR testing
  - Runs JavaScript/TypeScript tests via `pnpm test`
  - Runs Rust tests via `cargo nextest`
  - Triggers on all PRs to `main`
- Added `.github/workflows/build-ci-image.yml` for Docker image builds
- Added concurrency groups to prevent duplicate workflow runs
- Proper JUnit XML generation for test reporting
- Test artifact management and gitignore updates

### 📚 Documentation

**Development Documentation**

- Added Wear OS implementation foundation docs
- Added Wear OS UI mockups for future development
- Created `docs/ghcr-setup.md` for GitHub Container Registry usage
- Added workflow for GitHub PR write-up generation
- Clarified commit message guidelines in `AGENTS.md`
- Updated `AGENTS.md` with new workflows and rules

**Plugin Documentation**

- Deferred iOS implementation in time-prefs plugin with explanatory comments
- Added documentation for plugin patterns

### 🔧 Configuration & Refactoring

**Build System**

- Created Cargo workspace at repository root
- Moved `profile.release` to workspace root to eliminate warnings
- Updated gitignore for test artifacts and build logs
- Added workspace `Cargo.lock`

**Code Quality**

- Refactored ringing screen to use CSS classes for desktop transparency
- Improved code organization in `AlarmSoundPickerService`
- Standardized mobile toolbar implementation across screens
- Removed unused imports and deprecated code

### 📝 Technical Details

**Major PRs Merged:**

- [#108](https://github.com/liminal-hq/threshold/pull/108) - Fix missing jest-dom types in vitest environment
- [#104](https://github.com/liminal-hq/threshold/pull/104) - Fix Ringing Screen UI: Button Colour and Tap Highlight
- [#102](https://github.com/liminal-hq/threshold/pull/102) - Custom Alarm Sound Integration (Desktop & Mobile)
- [#100](https://github.com/liminal-hq/threshold/pull/100) - Add CI/CD workflows for tests and docker images
- [#97](https://github.com/liminal-hq/threshold/pull/97) - Clarify commit message guidelines in AGENTS.md
- [#95](https://github.com/liminal-hq/threshold/pull/95) - Add wear os implementation docs and ui mockups
- [#49](https://github.com/liminal-hq/threshold/pull/49) - Defer iOS implementation in time-prefs plugin
- [#48](https://github.com/liminal-hq/threshold/pull/48) - Enhance ringing screen, integrate alarm settings, and implement interactive snooze notifications
- [#44](https://github.com/liminal-hq/threshold/pull/44) - Refactor mobile toolbar to use reusable component and use menu for settings

**Commits:** 52 commits since v0.1.2  
**Contributors:** Scott Morris, google-labs-jules[bot]

### ✅ Verification

- [x] **Automated Tests**: All JavaScript and Rust tests passing in CI
- [x] **Desktop**: Custom alarm sounds working, window behaviour correct
- [x] **Mobile**: Theme colours correct on ringing screen, snooze notifications functional
- [x] **Build**: Release build v0.1.3 successful

---

## Version 0.1.2

**Release Date:** January 22, 2026  
**Commit:** [5947517](https://github.com/liminal-hq/threshold/commit/5947517f28782c49328d5519ed07dafa3ee508d9)  
**Merged PR:** [#50 - Initial Release + Theming Overhaul & Ionic Removal](https://github.com/liminal-hq/threshold/pull/50)

> [!IMPORTANT]
> This is the **initial internal release** of Threshold on Google Play.

### 🚀 Initial Release Highlights

- First internal release (v0.1.2) deployed to Google Play
- Complete theming system overhaul with HSL standardization
- Full removal of legacy Ionic Framework dependencies
- Production-ready Android build configuration

### 🎨 Theming System Refactor

**HSL Standardization**

- Converted "Deep Night" theme from Hex/RGB to HSL (Hue, Saturation, Lightness)
- Implemented dynamic colour utilities in `themes.ts`:
  - `colourToHsl`: Convert any colour format to HSL
  - `getTint`: Generate lighter colour variations
  - `getShade`: Generate darker colour variations
- Programmatic palette generation ensures consistent gradients for Material You system themes

**CSS Variable Overhaul**

- Renamed all CSS variables from `--ion-color-*` to `--app-colour-*` (Canadian spelling)
- Removed legacy `*-rgb` variables
- Modernized transparency handling using CSS `color-mix()` function
  - Example: `color-mix(in srgb, var(--app-colour-primary), transparent 50%)`

**Material You Integration**

- System theme support with dynamic colour extraction on Android
- Automatic palette generation from system colours
- Enabled Material You by default on supported platforms

### 🧹 Legacy Cleanup (Ionic Removal)

**Removed Artifacts**

- Purged all `ion-*` CSS selectors (e.g., `ion-segment`, `ion-segment-button`)
- Deprecated and cleared `variables.css`
- Removed unused Ionic component styles from `components.css`

**Component Updates**

- Updated `NotFound.tsx` to use new variable system
- Updated `TitleBar.css` with new colour variables
- Updated `TimePicker.css` with new colour variables
- Updated `ContextMenu.css` with new colour variables
- Updated `ThemeContext.tsx` to fix class name consistency

**Test Updates**

- Updated `themes.test.ts` to verify new Canadian variable names

### 🐛 Bug Fixes

**Ringing Screen Dark Mode**

- Fixed regression where ringing screen background remained transparent/white in dark mode
- Resolved class name mismatch between `ThemeContext` (`force-dark`) and `ringing.css` (`dark-mode`)
- Restored background gradient visibility in dark mode

**Build System**

- Fixed `build-release-devcontainer.sh` to correctly output debug symbols
- Corrected debug symbols zip output path in release build script
- Added keystore.properties existence check to prevent build failures
- Guarded release signing configuration against missing keystore

### 🔧 Configuration Updates

**Android Configuration**

- Finalized Android build configuration for release
- Updated `build.gradle.kts` with proper signing configuration
- Updated `AndroidManifest.xml` with correct permissions
- Set minimum SDK version to 26

**Tauri Configuration**

- Updated `tauri.conf.json` with release settings
- Configured package identifiers and version codes
- Set up deep linking for `threshold://` scheme

### ✨ Features Included in This Release

**System Integration**

- 12/24-hour time format detection (respects system preferences)
- Material You dynamic theming on Android 12+
- System theme support (Light/Dark/System)

**Alarm Features**

- Alarm creation and management
- Snooze length configuration
- Silence after settings
- Persistent alarm storage
- Android alarm scheduling integration

**User Interface**

- Modern HSL-based theming system
- Dark mode support with proper gradients
- Custom title bar
- Time picker component
- Context menu system
- Ringing screen with visual feedback

**Build & Development**

- Automated Android release builds
- Debug symbol generation
- DevContainer configuration for consistent development environment
- Gemini backup utilities for development

### 📝 Technical Details

**Files Changed:** 20 files  
**Insertions:** 438 lines  
**Deletions:** 597 lines  
**Net Change:** -159 lines (code cleanup and modernization)

### ✅ Verification

- [x] Visual: Ringing screen gradient confirmed visible and correct in Dark Mode
- [x] Build: Release build v0.1.2 and debug symbol generation verified successful
- [x] Code: Grep sweep confirms no remaining `ion-*` variable or selector references
- [x] Tests: `themes.test.ts` updated and passing

---

## Version 0.1.1

**Release Date:** Prior to January 22, 2026  
**Status:** Pre-release development version

### Changes

- Initial development and feature implementation
- Basic alarm functionality
- Initial UI implementation with Ionic Framework
- Core plugin architecture established

---

## Release Notes Format

Each release entry should include:

- **Version number** and release date
- **Commit hash** and PR link (if applicable)
- **Highlights** of major changes
- **Features** added or modified
- **Bug fixes** resolved
- **Technical details** (files changed, lines modified)
- **Verification** checklist

### Version Numbering

This project follows semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR**: Incompatible API changes
- **MINOR**: New functionality in a backwards-compatible manner
- **PATCH**: Backwards-compatible bug fixes
