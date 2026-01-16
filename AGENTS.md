# AGENTS.md

## Localization and Spelling

**REQUIREMENT:** All UI strings, code variables, comments, and documentation MUST use **Canadian English** spelling.

Examples:
- `colour` instead of `color`
- `centre` instead of `center`
- `neighbour` instead of `neighbor`
- `cancelled` instead of `canceled`
- `licence` (noun) vs `license` (verb) - though in UI context usually "Licence"

## Commit Messages

- Use Conventional Commits format (e.g., `feat: ...`, `fix: ...`, `docs: ...`).

## Code Organization

- This is a `pnpm` workspace monorepo.
- `apps/` contains the Tauri applications.
- `packages/` contains shared logic.
- `plugins/` contains custom Tauri plugins.

## Best Practices

- **NO BARREL FILES:** Do not use `index.ts` files to re-export modules. Import directly from the specific file.

## UI Project Structure

Follow this directory structure for React/Ionic applications:

- **`src/components/`**: Reusable UI components (Buttons, Cards, TimePickers). Prefer "dumb" components that take props.
- **`src/screens/`**: Full-page views corresponding to routes (e.g., `Home.tsx`, `EditAlarm.tsx`, `Ringing.tsx`).
- **`src/hooks/`**: Custom React hooks for logic reuse.
- **`src/services/`**: Singleton classes or modules for business logic (e.g., `DatabaseService`, `AlarmService`).
- **`src/theme/`**: Global styles, Ionic variables, and theme definitions.
- **`src/context/`**: React Context providers.
