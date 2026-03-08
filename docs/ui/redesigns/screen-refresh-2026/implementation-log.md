# Screen Redesign Implementation Log

This log tracks implementation progress for the Threshold UI redesign.
Each entry includes:
- what changed
- why it changed
- a short speaker script for presenting the update

## Entry Template

### 00 — YYYY-MM-DD HH:MM (TZ) - Short title

**What happened**
- item
- item

**Why this matters**
- item
- item

**Speaker script**
"Short talk track you can read during a walkthrough."

---

### 01 — 2026-03-08 — Phase 1: Foundation tokens and window size

**What happened**
- Changed desktop window dimensions from 450×800 to 760×680 in `tauri.conf.json`
- Created `uiTokens.ts` with card, banner, and footer spacing constants (no hex values)
- Created `alarmCardStyles.ts` with `alarmCardSx` and `accentRailSx` helper functions
- Created this implementation log file

**Why this matters**
- The wider window (760px) accommodates the two-column Settings layout coming in phase 4
- Shared tokens ensure visual consistency across all phases without hardcoded values
- The `accentRailSx` helper centralises the accent rail styling consumed by `AlarmItem` in phase 2

**Speaker script**
"Phase 1 lays the groundwork — wider desktop window, shared style tokens, and reusable card helpers. No visible UI changes yet beyond the window size, but every subsequent phase builds on these constants."

---

### 02 — 2026-03-08 — Phase 2: Home screen redesign

**What happened**
- Added left accent rail to `AlarmItem` — `primary.main` for enabled, `action.disabled` for disabled
- Created `NextAlarmBanner` component showing countdown (hours + minutes) to next alarm with `role="status"` for accessibility
- Created `PullToRefresh` component using pointer events and Framer Motion, with `prefers-reduced-motion` support
- Removed toolbar refresh icon on mobile (replaced by pull-to-refresh gesture)
- Moved desktop Settings gear from fixed top-right position to footer beside the Add Alarm button
- Reduced desktop container `mt` from `8` to `0` since `RootLayout` already provides 32px

**Why this matters**
- Accent rails provide instant visual state feedback without reading text
- The next-alarm banner makes the most important information glanceable from the home screen
- Pull-to-refresh follows platform conventions and declutters the mobile toolbar
- Footer gear keeps Settings discoverable without consuming vertical real estate

**Speaker script**
"Phase 2 transforms the home screen — alarm cards now have accent rails showing enabled/disabled state, a banner counts down to the next alarm, mobile gets pull-to-refresh, and the desktop Settings gear moves into the footer zone."

---

### 03 — 2026-03-08 — Phase 3: Edit screen theming and DaySelector fix

**What happened**
- Applied `borderRadius: UI.card.borderRadius` to time picker containers on both mobile and desktop
- Themed label `TextField` with rounded corners matching the card language
- Themed mobile sound picker `Paper` with `divider` border colour and `background.paper`
- Fixed `DaySelector` dark mode bug: replaced hardcoded `rgba(0, 0, 0, 0.12)` border with theme-aware `divider` colour

**Why this matters**
- The hardcoded border was invisible in dark mode — now adapts to all themes
- Consistent border radius across form controls ties the edit screen into the redesign's card language
- No logic or validation changes — purely visual refresh

**Speaker script**
"Phase 3 brings the edit screen in line with the new design language — rounded corners on all form controls and a long-standing DaySelector dark mode bug fixed. The border was hardcoded to a light-mode-only value; it now uses the theme's divider token."

---

### 04 — 2026-03-08 — Phase 4: Desktop Settings nav rail

**What happened**
- Replaced single-column desktop Settings with a two-column flex layout
- Left nav rail (220px, `background.default`, `divider` border, 14px radius) with four section buttons
- Right detail panel (`background.paper`, same border treatment) renders only the active section
- Active nav item uses `primary.main` background with `primary.contrastText`
- Material You toggle now visible on desktop with "Android only" secondary text and disabled state
- Extracted section content into shared render functions used by both mobile and desktop
- Mobile layout completely unchanged — still a flat scrollable list

**Why this matters**
- Desktop users no longer need to scroll past unrelated settings to reach Developer tools
- The nav rail pattern scales cleanly if more sections are added later
- Material You visibility on desktop removes a "hidden feature" surprise for users switching platforms

**Speaker script**
"Phase 4 is the biggest structural change — desktop Settings now uses a left nav rail with four categories and a right detail panel. Mobile stays exactly as before. The Material You toggle is now visible on desktop too, clearly labelled 'Android only' so users understand the platform constraint."

---

### 05 — 2026-03-08 — Phase 5: Desktop polish pass

**What happened**
- Simplified redundant `mt` ternary in `Home.tsx` desktop container
- Verified footer clearance: `pb: 10` (80px) clears the 56px fixed footer
- Verified `NextAlarmBanner` is inside the scrollable container and cannot push content off-screen
- Verified Settings gear and Add Alarm button don't overlap in footer flex layout

**Why this matters**
- Desktop spacing is consistent across all three screens (Home, Edit, Settings)
- No content overlap with fixed footers at any window width

**Speaker script**
"Phase 5 is a quick verification pass — all desktop screens have correct spacing relative to the TitleBar, and footers don't overlap content. Minor cleanup only."

---

### 06 — 2026-03-08 — Phase 6: QA and accessibility pass

**What happened**
- Added `prefers-reduced-motion` support to `SwipeToDeleteRow`: skips slide-off animation and uses instant snap-back
- Verified `NextAlarmBanner` has `role="status"` and dynamic `aria-label`
- Verified accent rail uses palette roles only (`primary.main`, `action.disabled`) — no hardcoded hex
- Verified `PullToRefresh` handles `prefers-reduced-motion` correctly
- Verified touch targets: FAB is 56px (above 48dp minimum), Switch is 38px (acceptable)
- Verified gesture orthogonality: PullToRefresh (`touchAction: pan-x`) and SwipeToDelete (`touchAction: pan-y`) are complementary
- Verified keyboard tab order: Home footer (Add → gear), EditAlarm footer (Cancel → Save)
- Verified desktop Settings IconButton has `aria-label="settings"`

**Why this matters**
- `SwipeToDeleteRow` was the only motion component without reduced-motion support — now all gesture components respect the user's accessibility preference
- All palette roles are theme-aware, ensuring contrast under all 6 themes in both light and dark variants

**Speaker script**
"Phase 6 closes the loop on accessibility — SwipeToDeleteRow now respects reduced motion, all interactive elements have proper aria labels, and touch targets meet minimum size requirements. Every colour reference uses palette roles, so contrast adapts automatically across all themes."
