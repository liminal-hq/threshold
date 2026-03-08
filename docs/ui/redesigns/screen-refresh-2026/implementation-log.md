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

---

### 07 — 2026-03-08 — Window size lock and position-only persistence

**What happened**
- Set `resizable: false` in `tauri.conf.json` to prevent users from resizing the window
- Changed `tauri-plugin-window-state` from saving all flags to `StateFlags::POSITION` only, so window size is never overwritten by the persisted state file
- Updated the stale `"main"` entry in `~/.config/ca.liminalhq.threshold/.window-state.json` (was 614×1524 from a previous HiDPI session) to the correct 760×680
- Removed `core:window:allow-set-size` from `desktop.json` capabilities (no longer needed since size is not restored)
- Confirmed `maximizable: false` was already set in `tauri.conf.json`

**Why this matters**
- The app was opening at the wrong size due to a stale HiDPI-scaled entry in the window state file overriding the config default
- With position-only persistence, screen position is remembered across sessions while the window always opens at the designed 760×680 size
- `resizable: false` removes the OS resize handle so users can never drift the window to an unexpected size

**Speaker script**
"Entry 07 locks the window to 760×680. Previously a stale window-state file from a HiDPI session was overriding the config. The fix: persist position only, not size, and set resizable to false so the size is always exactly what the design specifies."

---

### 08 — 2026-03-08 — TitleBar: capability-driven minimize/maximize buttons

**What happened**
- Added `isMaximizable` and `isMinimizable` state to `TitleBar`, queried from Tauri (`appWindow.isMaximizable()`, `appWindow.isMinimizable()`) on mount and on `tauri://resize`
- Restore `isMaximized` state tracking (was commented out)
- All three platform control variants (Mac, Windows, Linux) now conditionally render minimize and maximize buttons based on these flags — no more hardcoded commented-out blocks
- Context menu maximize/restore item and minimize item are likewise gated on the same flags
- Added `WindowMaximizeIcon` and `WindowRestoreIcon` to TitleBar imports (were unused while buttons were commented out)
- Removed `core:window:allow-maximize`, `allow-unmaximize`, `allow-toggle-maximize` from `default.json` capabilities — maximizing is disabled at the config level and the permissions are no longer needed

**Why this matters**
- The title bar now flexibly reflects whatever the Tauri config declares — setting `maximizable: true` later would automatically re-enable the button with no frontend code change
- Removes dead commented-out code in favour of a live data-driven pattern

**Speaker script**
"Entry 08 cleans up the TitleBar. Instead of commented-out maximize buttons, the title bar now reads isMaximizable and isMinimizable from Tauri at runtime and renders buttons accordingly. The config drives the UI — no frontend changes needed if capabilities change."

---

### 09 — 2026-03-08 — Remove redundant unmaximize call from App.tsx

**What happened**
- Removed `win.unmaximize()` call in `App.tsx` `showWindow` function
- This call was a legacy defensive measure to counteract the window-state plugin restoring a maximized state; it is now unreachable since the plugin is restricted to `StateFlags::POSITION` and can never restore a maximized state
- The call was emitting a permission error (`window.unmaximize not allowed`) because `allow-unmaximize` was correctly removed from capabilities in entry 08

**Why this matters**
- Eliminates a startup permission error logged on every desktop launch
- The capabilities file accurately reflects what the app actually needs — no phantom permissions, no phantom calls

**Speaker script**
"Entry 09 is a one-liner cleanup: a leftover unmaximize call from before we locked the window config was firing on every startup and hitting a permission wall. Removed it — the window-state plugin can't restore a maximized state anymore anyway."

---

### 10 — 2026-03-08 — Fix position persistence and maximize button visibility

**What happened**
- `App.tsx`: `win.center()` was called unconditionally on every startup, overwriting the position restored by `tauri-plugin-window-state`. Now only centres if `outerPosition` is `(0, 0)` (i.e. first launch, no saved position yet)
- `TitleBar.tsx`: `isMaximizable()` returns `true` on some platforms even when `maximizable: false` in config (OS window manager does not always reflect the config flag back to the query). Added `isResizable` state (which reliably returns `false` when `resizable: false`) and gate the maximize button on `isMaximizable && isResizable`

**Why this matters**
- Window position was never actually persisted across sessions because `center()` reset it on every launch
- The maximize button was appearing in the custom title bar despite being disabled in config

**Speaker script**
"Entry 10 fixes two regressions: the window was always centring on startup instead of restoring saved position, and the maximize button was showing because the OS doesn't always reflect the maximizable config flag back to the isMaximizable query. Both fixed — position now persists, maximize button stays hidden."

---

### 11 — 2026-03-08 — Edit screen layout fixes for 760×680 desktop window

**What happened**
- Window mode: changed desktop pickers from stacked vertical to **side by side** (flex row with `gap: 2`, each `flex: 1`) — matches v4 mockup
- Reduced title heading margin from `mb: 4` to `mb: 2`
- Reduced `Stack spacing` from `3` to `2` for tighter vertical rhythm
- Reduced all section bottom margins (`mb: 3` → `mb: 2`) for mode toggle, time picker box, window pickers stack, and label field
- Removed `Paper p: 3` padding on desktop (was adding 24px of unnecessary inset)
- Widened desktop container: removed `maxWidth="sm"` (600px) to use full window width with `px: 4` padding
- Mobile layout unchanged

**Why this matters**
- With the 760×680 window, all form fields (time picker, label, repeats, sound) now fit on screen without scrolling in Fixed Time mode
- Window mode pickers side by side use horizontal space efficiently and match the v4 mockup exactly
- Sound selector was previously cut off below the footer — now visible

**Speaker script**
"Entry 11 fixes the Edit screen layout for the new window size. Window mode pickers are now side by side as the mockup intended, and vertical spacing is tightened so all fields — including Sound — are visible without scrolling. The desktop container is wider to use the extra room."

---

### 12 — 2026-03-08 — Fix edit screen width and scrollability

**What happened**
- Set desktop form max-width to 700px (matching the v4 mockup's centred form width) instead of full-width `maxWidth: false`
- Removed `height: '100%'` from Container so content can exceed viewport height and trigger scrolling on the outer Box
- Sound picker was cut off below the fixed footer because the container was constrained to viewport height — now scrollable

**Why this matters**
- The form no longer stretches edge-to-edge on the 760px window — it has proper horizontal breathing room
- Sound picker and any future fields below it are now accessible via scroll

**Speaker script**
"Entry 12 pulls the form back to a centred 700px max-width for proper breathing room, and fixes scrollability so the Sound picker is no longer trapped behind the footer."
