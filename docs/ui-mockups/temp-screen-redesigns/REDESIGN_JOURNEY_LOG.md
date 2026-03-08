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
