# Screenshot harness

Renders the real `App` in a plain browser (no Tauri runtime) by mocking the Tauri IPC
layer, so its screens can be screenshotted for `docs/onboarding/first-use-tutorial.html`.
Not part of the production build (outside `tsconfig`'s `include`, no CI job touches it) —
kept here purely so the tutorial's screenshots can be regenerated after a UI change.

## Run it

```bash
pnpm --filter threshold exec vite --config vite.harness.config.ts
```

Then open `http://127.0.0.1:1430/dev-harness/index.html`, with query params:

- `?seed=empty|populated` — `empty` for a fresh-install alarm list, `populated` (default)
  seeds one Fixed Time and one Window alarm so both render.
- `?platform=linux|android` — what `PlatformUtils.isMobile()` sees; `android` flips the
  app into its mobile layout (top app bar, floating action button, swipe-to-delete rows).
  Defaults to `linux` (desktop layout).

`tauriMock.ts` patches `window.__TAURI_INTERNALS__.invoke` (via `@tauri-apps/api/mocks`)
with an in-memory alarm store answering the same commands `AlarmService`/`SettingsService`
call in production, plus the `plugin-os` globals the mobile-layout check reads
synchronously. `main.tsx` mirrors `src/main.tsx` (minus `initLogger`, since `plugin-log`
has no IPC here) so it mounts the exact same `App`.

Capture at the real window sizes: 760×680 for desktop (the app's fixed window), 412×915
for Android.
