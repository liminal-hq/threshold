# Play Store release notes

Per-locale "What's new" text uploaded verbatim to Google Play alongside each release build (see `docs/infrastructure/release-build.md`).

These files are **not** documentation — their content is user-facing text shown directly in the Play Store listing. Keep each one under Play's 500-character limit per locale, and update it as part of preparing each release (alongside the `RELEASE_NOTES.md` entry, which is longer-form and serves a different audience).

- `whatsnew/whatsnew-en-CA` — the phone app (`ca.liminalhq.threshold`)
- `whatsnew-wear/whatsnew-en-CA` — the Wear OS app

File naming follows the [BCP 47](https://tools.ietf.org/html/bcp47) locale format the `r0adkll/upload-google-play` action expects: `whatsnew-<LOCALE>`. Add more locale files alongside `en-CA` if the app is ever localised.
