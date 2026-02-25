# AGENTS.md

## Table of Contents

- [Localization and Spelling](#localization-and-spelling)
- [Commit Messages](#commit-messages)
- [Play Console Release Notes](#play-console-release-notes)
- [Pull Request Titles](#pull-request-titles)
- [Pull Request Labels](#pull-request-labels)
- [Application Protocol](#application-protocol)
- [Code Organization](#code-organization)
- [Best Practices](#best-practices)
- [Plugin Development](#plugin-development)
- [UI Project Structure](#ui-project-structure)
- [Licence and Copyright](#licence-and-copyright)
- [Tauri v2](#tauri-v2)

## Localization and Spelling

**REQUIREMENT:** All UI strings, code variables, comments, commit messages, pull request descriptions, and documentation MUST use **Canadian English** spelling.

Examples:

- `colour` instead of `color`
- `centre` instead of `center`
- `neighbour` instead of `neighbor`
- `cancelled` instead of `canceled`
- `licence` (noun) vs `license` (verb) - though in UI context usually "Licence"

## Commit Messages

**Format:** Use Conventional Commits format (e.g., `feat: ...`, `fix: ...`, `docs: ...`, `test: ...`).

- Use `test:` for test-related changes, including fixes to tests themselves (do not use `fix:` unless it fixes application code).

**Body Requirements:**

- Explain what and why (not how)
- Use markdown: **bold**, _italics_, `code`, bullet lists
- **NO markdown headings** - use **bold labels** for sections (not always required)

**Specific Updates**: Each commit message should reflect the specific changes made in that commit. Do not just recap the entire project history or scope. Focus on the now.

**Shell Interpolation Safety:**

- Do not pass markdown-heavy commit bodies directly via `git commit -m "..."` when they include backticks, `$()`, or shell-sensitive characters.
- Prefer writing the message to a file with a single-quoted heredoc and commit with `git commit -F <file>` to prevent shell expansion.
- If using `-m`, escape shell-sensitive characters explicitly before running the command.
- After committing, verify the stored message with `git log -1 --pretty=fuller` and amend immediately if interpolation altered content.

## Play Console Release Notes

When drafting release notes for Google Play Console:

- Always use locale blocks in this exact format:

```text
<en-CA>
Enter or paste your release notes for en-CA here
</en-CA>
```

- Keep each locale block at **500 Unicode characters or fewer**.
- For this repository, provide **separate sections** for:
  - Threshold phone app release notes
  - Threshold Wear OS companion app release notes
- Use compact, user-facing language suitable for Play Console.
- Prefer concise headings and bullets (for example: "What's New", "Fixes", "Improvements").
- Include emoji-led mini headings (for example: `⌚`, `🔔`, `🐛`, `🛠️`) to match the established Play Console style.
- Use the `•` bullet character inside locale blocks (not markdown `-`) to match accepted Play Console formatting.
- Keep spelling in Canadian English.

## Pull Request Titles

**REQUIREMENT:** PR titles MUST be human-readable summaries of the PR change.

- Start with a capital letter.
- Do not use Conventional Commit prefixes in PR titles (for example, no `feat:`, `fix:`, `chore:`).
- Describe the outcome or behaviour change, not internal process language.
- Ignore internal planning document notes in PR titles and descriptions unless they directly map to repository changes.
- Keep title style consistent across every open PR in the same stack.
- If one title in a stack is updated, update the rest of the open stack titles to match style and scope.
- Do not rename merged PRs unless explicitly requested.
- Keep linked issues and merge order aligned after any title changes in a stack.

## Pull Request Labels

**REQUIREMENT:** Add labels to every PR when it is created or updated.

- Apply labels that match scope and impact (for example: `build`, `plugin`, `android`, `release`, `bug`).
- Prefer 2-4 labels that clearly describe the PR; avoid label spam.
- Keep labels consistent across open PRs in the same stack.
- If scope changes during review, update labels so they stay accurate.

## Git Workflow

**REQUIREMENT:** Do not push changes (especially force pushes) to the repository unless explicitly requested by the user.

## Application Protocol

- The application registers the `threshold://` protocol for deep linking.
- **Use Cases:** External apps can launch Threshold with `threshold://set?time=07:30`
- **IMPORTANT:** If the app name or identifier changes, ensure this protocol registration is updated in `tauri.conf.json` and relevant documentation.
- **See Also:** `/docs/desktop/deeplinks.md` for usage examples

## Code Organization

- This is a `pnpm` workspace monorepo.
- `apps/` contains the Tauri applications.
- `docs/` contains documentation.
- `packages/` contains shared logic.
- `plugins/` contains custom Tauri plugins.

## Best Practices

- **NO BARREL FILES:** Do not use `index.ts` files to re-export modules. Import directly from the specific file.
- **USE HELPERS:** Always check for existing helper utilities before implementing manual logic. For example, use `PlatformUtils` (e.g., `isMobile()`, `isDesktop()`) instead of manual platform checks.

## Plugin Development

When creating or modifying Threshold plugins with Android support:

**Documentation:** All plugin patterns are in `/docs/plugins/`

- **Quick Start:** `/docs/plugins/plugin-manifest-quickstart.md`
- **Full Reference:** `/docs/plugins/plugin-manifest-pattern.md`
- **PR Checklist:** `/docs/plugins/plugin-manifest-pr-checklist.md`
- **AI Agent Guide:** `/docs/ai-agent-usage-guide.md`

**Android Manifest Injection (Required):**

- Plugins MUST own their Android permissions via build-time injection
- Use `tauri_plugin::mobile::update_android_manifest()` in `build.rs`
- Block identifier format: `tauri-plugin-{plugin-name}.permissions`
- Inject permissions, keep components in library manifest
- Never require users to manually edit manifests

**Example:**

```rust
// plugins/your-plugin/build.rs
const COMMANDS: &[&str] = &["command1", "command2"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
    inject_android_permissions()
        .expect("Failed to inject permissions");
}

fn inject_android_permissions() -> std::io::Result<()> {
    let permissions = vec![
        r#"<uses-permission android:name="android.permission.CAMERA" />"#,
    ];
    tauri_plugin::mobile::update_android_manifest(
        "tauri-plugin-your-plugin.permissions",
        "manifest",
        permissions.join("\n"),
    )
}
```

See quickstart guide for complete implementation steps.

**Reference Implementation:** See `plugins/alarm-manager/build.rs` for a complete working example.

**See Also:**

- `/docs/plugins/alarm-manager.md` - Alarm manager plugin specification
- `/docs/android/intents.md` - Android intent handling

## UI Project Structure

Follow this directory structure for React/MUI applications:

- **`src/components/`**: Reusable UI components (Buttons, Cards, TimePickers). Prefer "dumb" components that take props.
- **`src/screens/`**: Full-page views corresponding to routes (e.g., `Home.tsx`, `EditAlarm.tsx`, `Ringing.tsx`).
- **`src/hooks/`**: Custom React hooks for logic reuse.
- **`src/services/`**: Singleton classes or modules for business logic (e.g., `DatabaseService`, `AlarmService`).
- **`src/theme/`**: Global styles, MUI theme definitions, and Material You integration.
- **`src/context/`**: React Context providers.

**See Also:** `/docs/ui/ui-task.md` for UI implementation details

## Licence and Copyright

**REQUIREMENT:** All source code files (Rust, Kotlin, TypeScript, etc.) MUST include a licence and copyright header as the first content in the file.

**Header format:**

For Rust (`.rs`) and Kotlin (`.kt`) files:
```
// Brief one-line summary of what this file does.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
```

For TypeScript/JavaScript (`.ts`, `.tsx`, `.js`) files:
```
// Brief one-line summary of what this file does.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
```

**Rules:**

- The first line is a concise summary of the file's purpose (one sentence, no period)
- Place the header before any `package`, `use`, `import`, or `mod` statements
- Leave one blank line between the header and the first code line
- Do not add headers to generated files, configuration files (`.toml`, `.json`, `.yml`), or documentation (`.md`)
- When visiting an existing file that lacks a header, add one as part of the current change
- Use `SPDX-License-Identifier` for machine-readable licence identification

## Tauri v2

This project uses **Tauri v2** with native mobile support (iOS/Android).

### Platform Detection

Use `@tauri-apps/plugin-os` for reliable platform detection across all targets.

**Key points:**

- The `platform()` function is **synchronous** and determined at compile time
- Returns: `'linux' | 'macos' | 'ios' | 'freebsd' | 'dragonfly' | 'netbsd' | 'openbsd' | 'solaris' | 'android' | 'windows'`
- Use this for conditional UI rendering (e.g., mobile vs desktop layouts)

**Example:**

```tsx
import { platform } from '@tauri-apps/plugin-os';

const [isMobile, setIsMobile] = useState(false);

useEffect(() => {
	const os = platform();
	setIsMobile(os === 'ios' || os === 'android');
}, []);
```

### Window Management

- **Desktop platforms**: Use custom title bars with `data-tauri-drag-region` attribute for draggable areas
- **Mobile platforms**: Use MUI `AppBar`/`Toolbar` or custom headers
- Window controls (minimize, maximize, close) should only render on desktop

### Tauri APIs

- Prefer Tauri plugins over web APIs when available (e.g., `@tauri-apps/plugin-fs` over browser File API)
- Most Tauri v2 APIs are async - use `async/await` pattern
- Check plugin documentation for platform-specific limitations

### Common v1 Pitfalls (Agent Guide)

Because many online resources refer to Tauri v1, older patterns may inadvertently be suggested. Use this reference to avoid v1 patterns.

**Configuration (`tauri.conf.json`) Differences:**

- `tauri` → `app` (top-level rename)
- `build.distDir` → `frontendDist`
- `build.devPath` → `devUrl` (now only accepts URLs, not paths)
- `tauri.allowlist` → **removed** - replaced by capabilities system (see below)
- `tauri.windows.fileDropEnabled` → `app.windows.dragDropEnabled`
- `tauri.bundle` → moved to top-level

**JavaScript API Changes:**

- `@tauri-apps/api` now only exports: `core`, `path`, `event`, `window`
- All other modules moved to plugins: `@tauri-apps/plugin-*`
  - `@tauri-apps/api/fs` → `@tauri-apps/plugin-fs`
  - `@tauri-apps/api/dialog` → `@tauri-apps/plugin-dialog`
  - `@tauri-apps/api/shell` → `@tauri-apps/plugin-shell`
  - `@tauri-apps/api/os` → `@tauri-apps/plugin-os`
  - etc.

**Permissions & Capabilities (Critical!):**

- v1's `allowlist` replaced by **capabilities** system (ACL-based)
- Create capability files in `src-tauri/capabilities/` directory
- Must explicitly grant permissions per plugin (e.g., `fs:allow-read-text-file`)
- **Gotcha**: Simply installing a plugin is NOT enough - you must define permissions in capabilities
- See [Tauri Security Docs](https://v2.tauri.app/security/) for details

**Rust Changes:**

- Many `tauri::api` modules moved to separate plugins
- Use `std::fs` or `tauri_plugin_fs` instead of `tauri::api::file`
- Menu and tray APIs moved to separate crates
