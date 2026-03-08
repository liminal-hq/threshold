# Screen Redesign Journey Log

This log tracks redesign progress for Threshold screen updates.
Each entry includes:
- what changed
- why it changed
- a short speaker script for presenting the update

## Entry Template

### YYYY-MM-DD HH:MM (TZ) - Short title

**What happened**
- item
- item

**Why this matters**
- item
- item

**Speaker script**
"Short talk track you can read during a walkthrough."

---

### 2026-03-08 12:27 (EDT) - Created redesign tracking branch and baseline snapshot

**What happened**
- created local branch `redesign/screen-refresh-journey`
- committed the full `temp-screen-redesigns` workspace as the baseline snapshot
- included original exploration files, screenshots, and new proposed-v1 mockups

**Why this matters**
- gives us a stable starting point for comparing each design iteration
- protects exploratory work while we refine the direction
- makes each follow-up commit easy to explain and review

**Speaker script**
"I started by creating a dedicated local redesign branch and capturing a full baseline snapshot. That gives us a safe foundation to iterate from, compare changes cleanly, and present progress in small, understandable steps."

---

### 2026-03-08 12:31 (EDT) - Added redesign journey log with presenter notes

**What happened**
- added `REDESIGN_JOURNEY_LOG.md` to track progress entries
- added a reusable log template for future updates
- included speaker-script sections so each change has a ready presentation summary

**Why this matters**
- keeps design exploration and implementation history in one place
- reduces presentation prep time by attaching narrative to each change
- helps maintain continuity as the redesign evolves over multiple commits

**Speaker script**
"I added a living redesign journal that records what changed, why it changed, and a short script for each step. As we continue, this will double as both our decision trail and a ready-made walkthrough guide."

---

### 2026-03-08 12:52 (EDT) - Documented desktop constraints and scaffolded UI screen specs

**What happened**
- updated the redesign plan to reflect desktop constraints from current app behaviour
- captured that desktop uses a borderless window with a custom title bar (not native window manager chrome)
- documented that desktop should keep the existing bottom add button style and place Settings gear to its right
- clarified in the plan that Material You is Android-only
- scaffolded baseline UI specs from current code under `docs/ui/specs/`:
  - shared taxonomy
  - reusable screen spec template
  - baseline specs for Home, Edit/New Alarm, and Settings

**Why this matters**
- aligns redesign docs with how desktop actually works today
- reduces design drift by locking baseline behaviour before visual rework
- gives us repeatable structure for future UI changes without re-discovering page anatomy each time

**Speaker script**
"We corrected the desktop assumptions in the plan to match reality: borderless custom title bar, existing bottom add button style, and a Settings gear that will live beside that button. We also scaffolded baseline screen specs directly from current code, so future redesign work can move faster with clear UI contracts."

---

### 2026-03-08 13:15 (EDT) - Added explicit mobile vs desktop concept modelling to specs

**What happened**
- upgraded the UI taxonomy to include a dedicated platform concept layer
- updated the screen spec template with:
  - `Platform Concept Model` sections for Shared, Mobile, and Desktop concepts
  - a `Platform Mapping Matrix` for cross-platform concept expression
- refactored baseline screen specs (`Home`, `Edit/New Alarm`, `Settings`) to use the new concept-first structure

**Why this matters**
- turns platform differences into explicit contracts instead of incidental notes
- makes future redesign passes easier by preserving concept intent across layout changes
- improves review clarity by showing what is shared vs what is platform-specific

**Speaker script**
"We upgraded the spec system so mobile and desktop are first-class concepts, not side notes. Each screen now declares shared concepts, mobile concepts, desktop concepts, and a mapping matrix that shows how the same intent is expressed per platform. This gives us a stronger foundation for future UI rework."

---

### 2026-03-08 13:21 (EDT) - Confirmed redesign churn tracking policy

**What happened**
- confirmed that iterative SVG and redesign doc churn should stay tracked in git
- decided not to add `.gitignore` rules for redesign iteration files
- added explicit versioning policy language to the redesign update plan

**Why this matters**
- preserves the full chronology of design decisions and pivots
- keeps exploration history reviewable for future retrospectives
- supports storytelling and presentation of how the redesign matured over time

**Speaker script**
"We made a deliberate process decision: the churn is part of the story, so we are tracking iterative redesign assets in git instead of ignoring them. That gives us a clear chronology of how ideas evolved and why final choices were made."

---

### 2026-03-08 13:25 (EDT) - Published proposed-v2 SVG set for next review pass

**What happened**
- created `proposed-v2` SVGs and switched plan image references to the new set
- updated Home desktop concept to show:
  - borderless custom title bar context
  - existing bottom add button style
  - Settings gear positioned to the right in the bottom action zone
- updated Settings mobile and desktop concepts to a flatter list-first direction (reduced bubble-card noise)
- carried Edit and Home mobile forward into `proposed-v2` to keep a complete review set

**Why this matters**
- aligns mockups with latest desktop constraints and interaction expectations
- tests the \"flat settings\" direction before implementation work begins
- keeps review artefacts versioned by iteration (`v1` -> `v2`) for clearer chronology

**Speaker script**
\"This v2 pass brings the mockups in line with our latest decisions: desktop Home now keeps the current bottom add button style and moves Settings gear into that same action zone, while Settings shifts to a flatter list layout to reduce visual noise. We also versioned the full set as v2 so we can compare evolution cleanly against v1.\"

---

### 2026-03-08 13:32 (EDT) - Shifted to proposed-v3 with updated desktop and settings direction

**What happened**
- created `proposed-v3` SVG review set with the original dark comparison palette
- revised Home desktop concept to avoid literal screenshot replication while keeping:
  - bottom add button style
  - Settings gear to the right of add action zone
- locked mobile Settings direction close to current structure, without line-heavy treatment
- restored desktop Settings left-category/right-detail composition inspired by v1
- updated plan image references and settings direction notes to point to `proposed-v3`

**Why this matters**
- keeps inspiration and final mockup direction separate to avoid overfitting to a single screenshot
- confirms settings strategy for mobile and desktop before implementation
- preserves clear `v1 -> v2 -> v3` chronology with explicit rationale per pivot

**Speaker script**
"This v3 pass intentionally steps back from screenshot cloning while still honouring the desktop constraints we agreed on. We kept the dark palette for easy comparison, locked mobile Settings close to current behaviour, and brought back the desktop left-nav/right-panel structure from v1. That gives us a cleaner, more intentional baseline for the next review round."

---

### 2026-03-08 — Settled key decisions and produced code-faithful mobile Settings mockup (v4)

**What happened**
- reviewed the v3 mockup set against the actual source code and desktop screenshot
- settled five design decisions that were previously open questions (see plan section 11)
- identified that the v3 mobile Settings SVG was already a redesign concept, not a faithful representation of current code
- produced `proposed-v4/threshold-settings-mobile-v4.svg` — a code-faithful rendering of `Settings.tsx` in the `deep-night` dark comparison palette
- v4 mobile Settings includes all rows present in code: Theme select, conditional Material You toggle, Force Dark Mode, Silence After select, Snooze Length tap-to-open row, 24-Hour Time toggle, and all five Developer rows (Test Alarm Ring, Test Watch Ring, Test Notification, Force Synchronise, Download Event Logs)
- developer icon button colours are mapped to correct MUI palette roles: `primary.main` (#4c8dff), `secondary.main` (#2563eb), `info.main` (#0288d1)
- updated plan section 5 (Settings), section 11 (settled decisions), and section 12 (open questions)

**Why this matters**
- establishes an honest baseline before any mobile Settings redesign work begins
- ensures the implementing agent works from the actual screen structure, not a redesigned approximation
- locks theming-in-mockups policy: deep-night dark for comparison consistency, palette roles in code

**Speaker script**
"We used this pass to settle the open questions and get honest about the mobile Settings baseline. Rather than designing over a concept, we drew the current code faithfully in the mockup palette. That gives us a clear before-state to compare any future iteration against, and closes the loop on decisions that were blocking the next phase."

---

### 2026-03-08 — Produced implementation plan and settled all open decisions

**What happened**
- produced `docs/ui/IMPLEMENTATION_PLAN.md` — a 6-phase engineering execution plan with explicit file-level change sets and acceptance checks per phase
- settled all four open questions: disabled accent rail uses `palette.action.disabled`; `NextAlarmBanner` background uses `alpha(primary.main, 0.12)` fill + `1px solid` left border; `PullToRefresh` spinner uses MUI `CircularProgress`; desktop Settings nav rail is in scope for phase 4 (not deferred)
- upgraded phase 4 desktop Settings from "verify only" to a full structural change: left nav rail + right detail panel layout, replacing the current single-column `Container maxWidth="sm"`
- nav rail: four sections (Appearance, Alarm Settings, General, Developer), active item highlighted in `primary.main`, both panels use `borderRadius: '14px'` and `border: 1px solid divider` card language; right panel uses `background.paper` surface, left rail uses `background.default`
- Material You row shown on desktop but non-interactive with "Android only" label — not hidden
- confirmed phase execution: all phases run in sequence with a commit after each phase

**Why this matters**
- plan is fully ready to hand to an implementing agent with no open questions remaining
- desktop Settings nav rail gives developers a proper two-panel layout that scales as settings grow, rather than deferring the structural work to a later pass
- settled decisions are locked in both the implementation plan and the journey log so future agents have the full rationale

**Speaker script**
"This session closed the loop on planning. We produced the full phase-by-phase implementation plan and settled every open question before handing off to an implementing agent. The biggest decision was pulling the desktop Settings nav rail into scope now — it adds real structural work to phase 4 but gives us a layout that actually fits the app's desktop character rather than a re-skinned mobile column."

---

### 2026-03-08 — Settled desktop window dimensions at 760 × 680

**What happened**
- reviewed all window size configuration points in the codebase: main app window in `tauri.conf.json` (450 × 800), ringing window in `AlarmManagerService.ts` (400 × 500), test alarm window in `Settings.tsx` (400 × 500)
- decided main app window should be wider than tall to match the mockup canvas proportions (1100 × 790 in the OS context view)
- settled on 760 × 680 (width × height) for the main window — wider-than-tall, compact but comfortable for the nav rail layout
- ringing and test alarm windows stay at 400 × 500 unchanged
- window resize added to phase 1 of the implementation plan; `tauri.conf.json` change deferred to implementation

**Why this matters**
- the current 450 × 800 portrait window is too narrow for the Settings nav rail + detail panel layout
- 760 × 680 gives the left rail (220px) and right panel (remaining ~490px) comfortable room without making the app feel oversized on a desktop
- locking the size now prevents the implementing agent from inheriting a window shape that conflicts with the new layout

**Speaker script**
"We reviewed every place window sizing is configured and settled the main window at 760 by 680. That's wide enough for the new Settings two-panel layout and matches the wider-than-tall proportion shown in the desktop OS context mockup. The ringing window stays at its existing 400 by 500 — that's a separate floating alarm window and shouldn't change."

---

### 2026-03-08 — Full consistent v4 mockup set across all screens

**What happened**
- regenerated all six mockups as a consistent `proposed-v4` set: Home mobile/desktop, Edit mobile/desktop, Settings mobile/desktop
- all mockups share: wider phone shell (560px vs 400px in earlier passes), consistent deep-night dark comparison palette, correct `TitleBar.tsx` representation (32px bar, centred app title, platform window controls), and annotated theme token reminders
- Home mobile: removed toolbar refresh icon (pull-to-refresh replaces it), added Next alarm banner, accent rail on alarm cards, overflow ⋮ menu only
- Home desktop: full-width `+ ADD ALARM` button matching existing code style, Settings ⚙ gear moved into footer zone beside add button
- Edit mobile: wider shell, correct toolbar pattern (✕ left / title centre / Save right), day selector properly spaced
- Edit desktop: `TitleBar.tsx` drawn correctly, custom desktop time picker represented, fixed footer Cancel + Save actions
- Settings mobile: carried forward unchanged from code-faithful v4 pass
- Settings desktop: `TitleBar.tsx` bar, left nav rail (Appearance active, others inactive), right detail panel; Material You row greyed as desktop-unavailable
- updated plan section 4 image references to point at `proposed-v4` across all screens

**Why this matters**
- all screens now tell a consistent visual story before implementation begins
- mockups faithfully represent settled decisions rather than earlier conflicting assumptions
- implementing agent has an accurate reference for each screen and platform

**Speaker script**
"This v4 pass brings the full set into alignment. Every screen shares the same palette, the same correct desktop title bar, the same phone shell proportions, and reflects every decision we settled. We are ready to move from mockup review into implementation planning."
