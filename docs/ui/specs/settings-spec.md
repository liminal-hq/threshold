# Settings Screen Spec

## Metadata

- Status: baseline
- Last Updated: 2026-03-08
- Route: `/settings`
- Primary Source Files:
  - `apps/threshold/src/screens/Settings.tsx`
  - `apps/threshold/src/contexts/ThemeContext.tsx`
  - `apps/threshold/src/services/SettingsService.ts`

## Purpose

- manage appearance, alarm preferences, and developer utility actions

## Platform Concept Model

### Shared Concepts

- `SETTINGS-C1`: Grouped Settings Sections - appearance, alarm settings, general, developer
- `SETTINGS-C2`: Persistent Preference Controls - settings persisted through `SettingsService`
- `SETTINGS-C3`: Theme Source Management - theme selection and dark mode controls
- `SETTINGS-C4`: Diagnostic Utilities - developer actions for ring, sync, notification, and logs

### Mobile Concepts

- `SETTINGS-M1`: Compact Back Header - toolbar with back action and title
- `SETTINGS-M2`: Mobile Companion Action - `Test Watch Ring` available on mobile only
- `SETTINGS-M3`: Android Dynamic Colour Gate - Material You toggle shown only on Android when theme is `system`

### Desktop Concepts

- `SETTINGS-D1`: In-Page Back Header - inline back icon and title row
- `SETTINGS-D2`: Desktop Ringing Test Window - `Test Alarm Ring` can open separate desktop ringing window
- `SETTINGS-D3`: Theme Without Dynamic Extraction - desktop follows selected theme and force-dark without Material You extraction

## Platform Mapping Matrix

| Concept ID | Mobile Expression | Desktop Expression |
|---|---|---|
| `SETTINGS-C1` | grouped MUI lists with subheaders | grouped MUI lists with subheaders |
| `SETTINGS-C2` | toggle/select updates via `SettingsService` | toggle/select updates via `SettingsService` |
| `SETTINGS-C3` | theme select + conditional Material You toggle | theme select without Material You extraction |
| `SETTINGS-C4` | developer rows + mobile-only watch test | developer rows + desktop ring window flow |

## Platform Behaviour

### Mobile

- uses `MobileToolbar` with back action
- uses grouped list sections for settings categories
- includes mobile-only `Test Watch Ring` control

### Desktop

- uses inline back button plus `Settings` heading
- same grouped list structure and controls
- developer `Test Alarm Ring` opens separate ringing webview window

## Layout Anatomy

1. header zone
- mobile toolbar or desktop inline title row

2. settings content zone
- `Appearance`
- `Alarm Settings`
- `General`
- `Developer`

3. dialogue zone
- snooze-length picker dialogue (1 to 30 minutes)

## Content Contract

- appearance theme options:
  - `system`, `deep-night`, `canadian-cottage-winter`, `georgian-bay-plunge`, `boring-light`, `boring-dark`
- `Use Material You` row appears only when:
  - theme is `system`
  - platform is Android
- `Force Dark Mode` always available
- alarm settings include silence-after select and snooze length selector
- general includes `24-Hour Time` toggle
- developer includes ring, sync, notification, and log actions

## Interaction Contract

- all setting changes persist through `SettingsService`
- settings changes emit cross-window events
- snooze length updates also invoke Rust sync command
- export logs action has in-progress guard and spinner icon state

## State Matrix

- default state: values loaded from `SettingsService`
- conditional state: Material You row hidden outside Android system-theme context
- in-progress state: log export button disabled with spinner
- dialogue state: snooze picker open or close and selected row state

## Theme Contract

- theme is controlled by `ThemeContext` and generated MUI theme
- Material You palette fetch is Android-only
- desktop does not request or apply Material You extraction directly
- desktop still follows selected theme and force-dark behaviour

## Accessibility Contract

- list rows and switches use MUI semantics
- dialogue list rows are keyboard navigable
- section subheaders preserve grouping semantics

## Local Exceptions

- developer section is always visible by default

## Open Questions

1. keep developer section always expanded, or collapse under a developer gate row?
2. should settings use a dedicated desktop navigation rail in a future pass?
