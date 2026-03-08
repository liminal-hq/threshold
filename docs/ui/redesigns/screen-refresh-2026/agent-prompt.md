# Implementing Agent Prompt

Use this prompt to hand off UI redesign implementation to an agent.

---

You are implementing a UI redesign for the Threshold alarm app (Tauri v2 + React + MUI v7). All planning is complete — your job is to execute the plan exactly as written.

**Start by reading these files in full before writing any code:**
- `docs/ui/redesigns/screen-refresh-2026/plan.md` — your primary instruction set
- `docs/ui/redesigns/screen-refresh-2026/design-decisions.md` — design decisions and rationale
- `docs/ui/redesigns/screen-refresh-2026/mockups/v4/` — reference mockups for all screens

**Branch:** Create a new branch off `redesign/screen-refresh-journey` named `redesign/ui-implementation` before making any changes.

**Ground rules (non-negotiable):**
- Use MUI palette roles and CSS vars from `ThemeContext` only — never hardcode hex values from mockups
- Do not rewrite logic, validation, or data flow — visual layer only (except the `DaySelector` dark mode bug fix in phase 3)
- Keep all existing `isMobile` branching unless the plan explicitly says otherwise
- Keep existing licence headers in any file that has one
- Canadian English in all strings, comments, and commit messages
- Commit after each phase is complete and passing — use Conventional Commits format

**Verification:** After each phase, run `pnpm --filter threshold tsc --noEmit` to confirm no TypeScript errors before committing. Then check the acceptance criteria listed in the plan for that phase.

**Implementation log:** Maintain `docs/ui/redesigns/screen-refresh-2026/implementation-log.md` as you work. After each phase commit, add a numbered entry using the same format as `journey-log.md` (what happened, why it matters, any decisions made). Create the file before your first commit if it does not exist.

**If you encounter anything unclear or ambiguous:**
- Do not guess — stop and ask before proceeding
- Do not make scope decisions on your own (e.g. "I also improved X while I was there") — implement only what the plan specifies

Execute phases 1 through 6 in sequence.
