# Release Notes

This document tracks all releases of the Threshold application.

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
