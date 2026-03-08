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

## Platform Behaviour

### Mobile

- uses `MobileToolbar` with back action
- uses grouped list sections for settings categories
- includes mobile-only `Test Watch Ring` control

### Desktop

- uses inline back button + `Settings` heading
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
- developer includes ring/sync/notification/log actions

## Interaction Contract

- all setting changes persist through `SettingsService`
- settings changes emit cross-window events
- snooze length updates also invoke Rust sync command
- export logs action has in-progress guard and spinner icon state

## State Matrix

- default state: values loaded from `SettingsService`
- conditional state: Material You row hidden outside Android system-theme context
- in-progress state: log export button disabled with spinner
- dialogue state: snooze picker open/close and selected row state

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
