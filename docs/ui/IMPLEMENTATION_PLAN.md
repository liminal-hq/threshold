# Threshold UI Redesign — Implementation Plan

Date: 2026-03-08
Branch: `redesign/screen-refresh-journey`
Status: Ready for review before execution

Reference mockups: `docs/ui-mockups/temp-screen-redesigns/proposed-v4/`
Reference specs: `docs/ui/specs/`
Reference plan: `docs/ui-mockups/temp-screen-redesigns/SCREEN_REDESIGN_UPDATE_PLAN.md`

---

## Ground rules for all phases

- Use MUI palette roles and CSS vars from `ThemeContext` only — never copy hex values from mockups.
- The mockup colour palette (`deep-night` dark) is for visual comparison only.
- Do not rewrite logic, validation, or data flow. Visual layer only in phase 1.
- Keep all existing `isMobile` branching unless explicitly noted.
- Keep existing licence headers in any source file that has one.
- Canadian English in all strings, comments, and commit messages.
- Commit after each phase is complete and passing.

---

## Phase 1 — Foundation: shared style helpers

**Goal:** Establish the reusable style constants and helpers that every subsequent phase will consume. No visible UI change yet.

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
- Add `overflowY: 'auto'` to the inner scroll container if not already present (confirm — currently `height: '100%', overflowY: 'auto'` is on the outer `Box`; the inner `Container` does not scroll independently — this is fine as-is).
- Verify scrolling works end-to-end on a real device or simulator. If the inner `Container` clips the Developer section, adjust the outer `Box` height and overflow chain.
- No structural or visual changes to mobile Settings in phase 1.

**Acceptance check:**
- All settings rows visible and reachable by scrolling on mobile.
- No layout regressions.

### Desktop

**Files:** `apps/threshold/src/screens/Settings.tsx`

The current desktop Settings layout is a centred `Container maxWidth="sm"` — a single scrollable column. The v4 mockup proposes a left nav rail + right detail panel. This is a **structural change** and is scope for a later pass (noted in specs as `SETTINGS-D1` concept, not yet implemented).

**Phase 4 desktop scope:** No structural change. Verify the existing layout renders correctly after the accent rail and banner work in phases 2–3 (no regressions from shared token changes).

**Acceptance check:**
- Desktop Settings loads without visual regressions.
- Developer section visible without needing to scroll past it (current behaviour preserved).

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
| `src/theme/uiTokens.ts` | 1 | New |
| `src/theme/alarmCardStyles.ts` | 1 | New |
| `src/components/AlarmItem.tsx` | 2a | Edit |
| `src/components/NextAlarmBanner.tsx` | 2b | New |
| `src/components/PullToRefresh.tsx` | 2c | New |
| `src/screens/Home.tsx` | 2b, 2c, 2d | Edit |
| `src/components/DaySelector.tsx` | 3 | Edit (bug fix) |
| `src/screens/EditAlarm.tsx` | 3 | Edit |
| `src/screens/Settings.tsx` | 4 | Edit (verify only) |

---

## Open questions before execution

1. **Accent rail colour for disabled alarms** — use `palette.action.disabled` (MUI built-in, adapts across themes) or `palette.text.disabled`? Both are theme-aware. Recommend `action.disabled` as it reads more as a UI state than text.
2. **`NextAlarmBanner` background treatment** — low-opacity `primary.main` fill, or a subtle left-border-only accent like the card rail? The mockup shows a faint filled band. Recommend `alpha(theme.palette.primary.main, 0.12)` as fill with a `1px solid` left border at `primary.main` for structure.
3. **`PullToRefresh` spinner style** — MUI `CircularProgress` in `primary` colour, or a simple animated chevron? Recommend `CircularProgress` to stay within existing component set.
4. **Desktop Settings nav rail** — confirmed out of scope for phase 1. Should this be tracked as a separate branch/issue now, or noted in the spec only?
