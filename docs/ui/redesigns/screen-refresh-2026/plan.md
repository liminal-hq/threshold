# Threshold UI Redesign — Implementation Plan

Date: 2026-03-08
Branch: `redesign/screen-refresh-journey`
Status: Ready for review before execution

Reference mockups: `docs/ui/redesigns/screen-refresh-2026/mockups/v4/`
Reference specs: `docs/ui/specs/`
Reference plan: `docs/ui/redesigns/screen-refresh-2026/design-decisions.md`

---

## Ground rules for all phases

- Use MUI palette roles and CSS vars from `ThemeContext` only — never copy hex values from mockups.
- The mockup colour palette (`deep-night` dark) is for visual comparison only.
- Do not rewrite logic, validation, or data flow. Visual layer only in phase 1.
- Keep all existing `isMobile` branching unless explicitly noted.
- Keep existing licence headers in any source file that has one.
- Canadian English in all strings, comments, and commit messages.
- Execute all phases in sequence. Commit after each phase is complete and passing.

---

## Phase 1 — Foundation: window size + shared style helpers

**Goal:** Establish the reusable style constants and helpers that every subsequent phase will consume, and update the desktop window dimensions. No visible UI change beyond window size.

### `apps/threshold/src-tauri/tauri.conf.json`

- Change main window `width` from `450` to `760` and `height` from `800` to `680`.
- Ringing window (`AlarmManagerService.ts`) and test alarm window (`Settings.tsx`) both stay at 400 × 500 — do not change.

**Acceptance check:** App opens at 760 × 680 on desktop. Ringing window still opens at 400 × 500.

### Files to create

#### `apps/threshold/src/theme/uiTokens.ts`

Export typed constants derived from MUI spacing and palette roles. No hardcoded values.

```ts
// Shared UI token constants for the redesign
// All values reference MUI theme spacing or are unitless multipliers.
// Colours are never hardcoded here — use palette roles at call site.

export const UI = {
  card: {
    borderRadius: '14px',       // Alarm card corner radius
    accentRailWidth: '6px',     // Left accent rail on alarm cards
    mobilePadding: 2,           // MUI spacing units (px = * 8)
  },
  banner: {
    borderRadius: '14px',
  },
  footer: {
    height: 56,                 // px — desktop bottom action bar height
  },
} as const;
```

#### `apps/threshold/src/theme/alarmCardStyles.ts`

Returns MUI `sx` objects for alarm card variants so `AlarmItem` and any future list component consume a single source of truth.

```ts
import { UI } from './uiTokens';

// Returns sx for the card container — enabled/disabled drives accent rail colour.
export function alarmCardSx(enabled: boolean, isMobile: boolean) { … }

// Returns sx for the left accent rail Box.
export function accentRailSx(enabled: boolean) { … }
```

**Acceptance check:** `alarmCardStyles.ts` exports two functions. `uiTokens.ts` has no hex values. Both files compile with no TypeScript errors.

---

## Phase 2 — Home screen

### 2a — AlarmItem: accent rail

**Files:** `apps/threshold/src/components/AlarmItem.tsx`

**Changes:**
- Restructure the `Card` interior to support the left accent rail.
- The `Card` itself gains `position: 'relative'` and `overflow: 'hidden'` (already has `overflow: 'hidden'` via `borderRadius`; confirm and set explicitly).
- Add a `Box` as the first child of the card: `position: 'absolute'`, `left: 0`, `top: 0`, `bottom: 0`, `width: UI.card.accentRailWidth`, background colour from `accentRailSx(alarm.enabled)`.
- Shift the text content `Box` to `pl: 1.5` to clear the rail (previously `p: 2` covers all sides; adjust left padding only).
- Keep all existing content: time (`h5`), label (`body2`), status stack (icon + caption).
- Keep `SwipeToDeleteRow` wrapper on mobile unchanged.
- Keep desktop delete `IconButton` and `Switch` unchanged.

**Acceptance check:**
- Enabled alarm shows accent rail in `primary.main` colour.
- Disabled alarm shows accent rail in a muted tone (e.g. `text.disabled` or `action.disabled`).
- Rail is visible under all 6 themes in both light and dark variants.
- Swipe-to-delete still functions on mobile — confirm the rail `Box` does not intercept pointer events (`pointerEvents: 'none'`).

### 2b — Home: next alarm banner

**Files:** `apps/threshold/src/screens/Home.tsx`

**New component to create:** `apps/threshold/src/components/NextAlarmBanner.tsx`

`NextAlarmBanner` accepts `alarms: AlarmRecord[]` and `is24h: boolean`. Internally:
- Filters to `enabled && nextTrigger && nextTrigger > Date.now()`.
- Sorts ascending by `nextTrigger`.
- Takes the first result. Returns `null` if none.
- Computes countdown string (hours + minutes) and formatted trigger time via `TimeFormatHelper`.
- Renders a `Box` using `sx` with `bgcolor: 'primary.main'` at low opacity (use `alpha()` from `@mui/material/styles`) or a subtle gradient — no hardcoded colours.

In `Home.tsx`:
- Render `<NextAlarmBanner alarms={alarms} is24h={is24h} />` between the toolbar (or top of container) and the alarm list.
- On mobile: inside the scrollable container, above the list.
- On desktop: inside the content area, above the `List`.
- Adjust `pt` on the container if needed to prevent overlap.

**Acceptance check:**
- Banner appears when at least one enabled alarm has a future `nextTrigger`.
- Banner disappears when all alarms are disabled.
- Banner updates when `alarms` context updates (event-driven — no extra polling).
- Banner renders correctly under all themes.

### 2c — Home: pull-to-refresh on mobile

**Files:** `apps/threshold/src/screens/Home.tsx`

**New component to create:** `apps/threshold/src/components/PullToRefresh.tsx`

Build using Framer Motion (`motion` package already in dependencies). Pattern:
- Track vertical drag on the scroll container via `useDragControls` or `useMotionValue`.
- Only activate when `scrollTop === 0` and drag direction is downward.
- Show a spinner/indicator at a threshold (e.g. 72px pull distance).
- On release past threshold: call `onRefresh()` callback, which calls `refresh()` from `useAlarms()`.
- Spring return animation on release.
- Respect `prefers-reduced-motion` — if reduced motion, skip animation and call refresh immediately on release.

In `Home.tsx`:
- Remove the `RefreshIcon` `IconButton` from `MobileToolbar` `endAction` on mobile (set `endAction` to `undefined`; the overflow ⋮ menu with Settings stays).
- Wrap the mobile alarm list in `<PullToRefresh onRefresh={refresh}>`.

**Acceptance check:**
- Pull gesture triggers `refresh()` on mobile.
- No visible refresh icon in toolbar.
- Settings still accessible via overflow ⋮ menu.
- Reduced motion: no spring animation, refresh fires on release.
- Desktop: no pull-to-refresh component rendered.

### 2d — Home desktop: move Settings gear to footer

**Files:** `apps/threshold/src/screens/Home.tsx`

**Changes:**
- Remove the fixed top-right `IconButton` (`position: 'fixed', top: '48px', right: '16px'`) for Settings on desktop.
- In the desktop footer `Box`, add a `IconButton` with `SettingsOutlinedIcon` to the right of the `Button`. Use `flexDirection: 'row'`, `alignItems: 'center'`, `gap: 1` or similar on the footer's inner `Box`.
- The `Button` keeps `maxWidth: 400, mx: 'auto'` and `display: 'flex'`.
- The gear `IconButton` sits beside the centred button — use a `Box` that is `display: 'flex'`, `alignItems: 'center'`, `justifyContent: 'center'`, `gap: 2` wrapping both.
- Adjust `mt` on the content container: currently `mt: 8` on desktop to clear the fixed settings button. After removing that button, reduce to `mt: 0` (the `TitleBar` is 32px and the content container gets `marginTop: '32px'` from the router layout — check `router.tsx`).

**Acceptance check:**
- Settings gear appears in the footer zone on desktop only.
- No settings button at top-right on desktop.
- `mt` correction means content does not start too far from the title bar.
- Navigates to `/settings` correctly.

---

## Phase 3 — Edit/New Alarm screen

**Files:** `apps/threshold/src/screens/EditAlarm.tsx`

This screen is a visual refresh only. Logic, validation, and save flow are unchanged.

**Changes:**
- Apply `borderRadius: UI.card.borderRadius` to the time picker input containers (the `Box` wrapping `MuiTimePicker` on mobile and the `DesktopCustomTimePicker` container on desktop) for visual consistency.
- Apply consistent `borderRadius` and `bgcolor: 'background.paper'` + `border: 1px solid` + `borderColor: 'divider'` to the label `TextField` and sound picker `Paper` row to match the card language.
- Sound picker row on mobile: confirm `Paper` with `variant="outlined"` renders with correct theme border colour. Currently uses `bgcolor: 'action.hover'` on hover — keep.
- Day selector: fix the hardcoded border in `DaySelector.tsx`: replace `border: '1px solid rgba(0, 0, 0, 0.12)'` with `borderColor: 'divider'` (use `sx` prop on `ToggleButton`).
- Preview card: apply same card language — `borderRadius: UI.card.borderRadius`, `bgcolor: 'background.paper'`, `border: 1px solid`, `borderColor: 'divider'`.
- No layout or form order changes.

**Acceptance check:**
- Form renders correctly in both Fixed and Window modes on both platforms.
- Day selector border visible in dark mode (was broken with hardcoded value).
- All fields use theme border tokens — no hardcoded colours.
- Save and cancel still work.

---

## Phase 4 — Settings screen

### Mobile

**Files:** `apps/threshold/src/screens/Settings.tsx`

**Changes:**
- No structural or visual changes to mobile Settings. The existing flat transparent `List` layout under `ListSubheader` labels is the target state.
- Confirm the outer `Box` (`height: '100%', overflowY: 'auto'`) scrolls correctly end-to-end so the Developer section is reachable. No code change needed unless testing reveals clipping.

**Acceptance check:**
- All settings rows visible and reachable by scrolling on mobile.
- No layout regressions.

### Desktop

**Files:** `apps/threshold/src/screens/Settings.tsx`

Replace the current single-column `Container maxWidth="sm"` desktop layout with a left nav rail + right detail panel. Mobile path is completely unchanged — all changes are inside `!isMobile` branches.

**Layout structure:**

- The outer `Box` (`height: '100%'`) gains `display: 'flex', flexDirection: 'column'` as before. Inside, below the back-arrow/heading row, add a `Box` with `display: 'flex', flexDirection: 'row', flexGrow: 1, gap: 2, overflow: 'hidden', px: 3, pb: 3`.
- **Left nav rail** — a `Box` with `width: 220, flexShrink: 0, bgcolor: 'background.default', border: '1px solid', borderColor: 'divider', borderRadius: '14px', p: 1`. Contains four `ListItemButton` entries: Appearance, Alarm Settings, General, Developer. Selected item: `bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: '10px'`. Unselected: `borderRadius: '10px'`.
- **Right detail panel** — a `Box` with `flexGrow: 1, overflowY: 'auto', bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '14px', p: 3`. Renders only the content for the active section.

**Active section state:**

Add `const [activeSection, setActiveSection] = useState<'appearance' | 'alarmSettings' | 'general' | 'developer'>('appearance')` (desktop only — not used on mobile).

**Section content mapping:**

- `appearance` — Theme `Select`, Material You `Switch` (shown but disabled/greyed with "Android only" `secondary` text on desktop — do not hide it, condition on `isAndroid` for the enabled state only), Force Dark Mode `Switch`.
- `alarmSettings` — Silence After `Select`, Snooze Length `ListItemButton`.
- `general` — 24-Hour Time `Switch`.
- `developer` — Test Alarm Ring `IconButton`, Force Synchronise `IconButton`, Test Notification `IconButton`, Download Event Logs `IconButton`. Test Watch Ring remains mobile-only (keep existing `isMobile` guard).

**Heading:** Remove the back-arrow + `Typography h4` "Settings" block that currently sits above the list. Replace with a back-arrow `IconButton` + `Typography h4` row that sits above the rail+panel flex row — same visual position, just outside the two-column layout.

**`mt` correction:** Current desktop uses `mt: 2` on the `Container`. With the new layout, set `mt: 0` on the outer `Box` — `RootLayout` already provides `marginTop: '32px'` for the `TitleBar`.

**Acceptance check:**
- Nav rail shows four items; active item highlighted in `primary.main`.
- Clicking each nav item switches the right panel content without navigation.
- Material You row visible on desktop but clearly labelled "Android only" and non-interactive.
- Developer section fully visible under the Developer nav tab — no scrolling past unrelated rows to reach it.
- All rows function correctly (switches toggle, selects open, dialogs open).
- Mobile layout completely unchanged.

---

## Phase 5 — Desktop polish pass

**Files:** `Home.tsx`, `EditAlarm.tsx`, `Settings.tsx`

**Checks to perform:**
- Confirm `mt` on each desktop screen correctly accounts for the 32px `TitleBar` (set via `marginTop: '32px'` in `router.tsx`'s `RootLayout`). Any screen using `mt: 2` or `mt: 8` should be reviewed.
- Confirm footer `Box` on `Home.tsx` and `EditAlarm.tsx` does not overlap content. Both currently use `pb: 10` / `pb: !isMobile ? 10 : 0` — verify the footer height (`UI.footer.height = 56`) is cleared.
- Confirm `NextAlarmBanner` on desktop does not push content off-screen.
- Confirm Settings gear in footer zone does not overlap the Add Alarm button at any window width.

---

## Phase 6 — QA and accessibility pass

**Checks:**
- Contrast ratio on accent rail colours under all 6 themes (light + dark variants).
- Contrast ratio on `NextAlarmBanner` text against banner background.
- Touch target size on mobile FAB (currently `size="large"` — confirm 48dp minimum).
- Touch target size on alarm card `Switch` (MUI Switch is 38px height — within acceptable range).
- `PullToRefresh` component: confirm drag does not interfere with horizontal swipe-to-delete (they are orthogonal gestures — verify by testing both simultaneously).
- Reduced motion: `PullToRefresh` skips animation, `SwipeToDeleteRow` spring still respects `prefers-reduced-motion` (check existing implementation).
- Keyboard navigation on desktop: focus order on `Home.tsx` footer (Add button → gear); tab order on `EditAlarm.tsx` footer (Cancel → Save).
- Screen reader: `NextAlarmBanner` should have appropriate `aria-label` or `role="status"`.

---

## File change summary

| File | Phase | Type |
|---|---|---|
| `src-tauri/tauri.conf.json` | 1 | Edit (window size) |
| `src/theme/uiTokens.ts` | 1 | New |
| `src/theme/alarmCardStyles.ts` | 1 | New |
| `src/components/AlarmItem.tsx` | 2a | Edit |
| `src/components/NextAlarmBanner.tsx` | 2b | New |
| `src/components/PullToRefresh.tsx` | 2c | New |
| `src/screens/Home.tsx` | 2b, 2c, 2d | Edit |
| `src/components/DaySelector.tsx` | 3 | Edit (bug fix) |
| `src/screens/EditAlarm.tsx` | 3 | Edit |
| `src/screens/Settings.tsx` | 4 | Edit (desktop nav rail + mobile verify) |

---

## Settled decisions (closed before execution)

1. **Accent rail colour for disabled alarms** — `palette.action.disabled`. Reads as a UI state, adapts across all themes.
2. **`NextAlarmBanner` background treatment** — `alpha(theme.palette.primary.main, 0.12)` fill with a `1px solid` left border at `primary.main` for structure.
3. **`PullToRefresh` spinner style** — MUI `CircularProgress` in `primary` colour. Stays within existing component set.
4. **Desktop Settings nav rail** — implemented in phase 4. Left rail (`background.default` surface, `primary.main` active highlight) + right detail panel (`background.paper` surface), both with `borderRadius: '14px'` and `border: 1px solid divider`. Material You row visible on desktop but non-interactive with "Android only" label.
