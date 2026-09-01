# Release Build CI

This guide covers the release pipeline in `.github/workflows/release-build.yml`.

## End-to-end release runbook (CLI/agent-friendly)

The full release flow, from version bump to a draft release sitting in Google Play Console, can be driven entirely from the command line -- no interactive terminal required except for the parts that are genuinely still manual (see below).

1. **Bump the version** from the repo root:

   ```bash
   pnpm --filter @threshold/release-tui dev -- --ci --bump patch   # or minor / major / an explicit semver
   ```

   This updates `apps/threshold/src-tauri/tauri.conf.json` (app version + Android `versionCode`), `apps/threshold-wear/build.gradle.kts` (Wear `versionName`/`versionCode`), and `apps/threshold/package.json`, then commits just those files and creates a local `v<version>` tag. Add `--dry-run` first to preview without writing anything, or `--build` to also produce local phone/Wear artefacts for a sanity check before pushing. Full flag reference: `pnpm --filter @threshold/release-tui dev -- --help`.

2. **Update the release notes** -- three separate documents, none of them generated from each other:
   - `RELEASE_NOTES.md`: the long-form, curated changelog entry (see existing entries for style). `gh api repos/liminal-hq/threshold/releases/generate-notes -f tag_name=v<version> -f target_commitish=main -f previous_tag_name=v<previous>` returns every merged PR since the last tag, grouped by label -- good raw material to draft the entry from, but the prose itself is written, not templated.
   - `distribution/whatsnew/whatsnew-en-CA`: the phone app's Play Store "What's new" text (500 character limit, shown directly to users).
   - `distribution/whatsnew-wear/whatsnew-en-CA`: same, for the Wear app.

   Commit these alongside (or as a follow-up to) the version-bump commit from step 1.

3. **Push.** `git push && git push origin v<version>`. This is the trigger -- everything from here is automatic.

4. **CI takes over**: builds and signs desktop, phone, and Wear artefacts; publishes a GitHub Release with the artefacts attached; pushes a **draft** release to Google Play's internal track for both the phone and Wear apps (see [Google Play Deployment](#google-play-deployment) below).

5. **Still manual:** reviewing and publishing the Play Console drafts (deliberately not auto-published -- see below), and anything beyond the `internal` track.

## Overview

The release workflow runs from two entry points:

- pushed tags matching `v*`
- manual runs via `workflow_dispatch` (optional `release_tag` input)

It will:

- resolve release metadata in `prepare-release` (`tag_name`, `release_name`)
- verify the target commit is on `main`
- create or reuse the GitHub Release before build jobs run
- build desktop artefacts
- build signed Android phone + Wear artefacts (`.aab`, `.apk`)
- collect mapping files and native debug symbols (when available)
- generate a `SHA256SUMS` file (one line per artefact) covering every published file
- publish a GitHub Release with curated distributable artefacts attached
- remove existing assets on reruns so release pages stay clean

## Container Base Image (`tauri-ci-mobile`)

The Android build job runs in `ghcr.io/liminal-hq/tauri-ci-mobile:latest`, a shared org-level image maintained in `liminal-hq/.github` (`docker/ci/Dockerfile`, published by `.github/workflows/shared-tauri-ci-images.yml` in that repo). It includes Rust, Node, and the Android SDK/NDK/JDK. Threshold no longer builds or publishes its own CI image -- if the shared image needs a version bump, that happens in `liminal-hq/.github`, not here.

## Node and Cache Behaviour

- Desktop jobs install Node from `.node-version` (`actions/setup-node` + `node-version-file`)
- `pnpm` dependency caching is enabled in desktop jobs
- Rust caching is enabled in desktop and Android jobs (`swatinem/rust-cache`)

## Required GitHub Secrets

Add these repository secrets:

- `ANDROID_UPLOAD_KEYSTORE_BASE64`
- `ANDROID_UPLOAD_KEY_ALIAS`
- `ANDROID_UPLOAD_KEYSTORE_PASSWORD`

The Android Gradle configuration expects these keys in `keystore.properties`:

- `keyAlias`
- `password`
- `storeFile`

The workflow writes temporary `keystore.properties` files for both phone and Wear builds using those values.

The signing step also normalises secret formatting to avoid common copy/paste issues:

- strips CR/LF and wrapping quotes from alias/password values
- supports standard and URL-safe base64 keystore payloads
- performs keystore readability validation before Gradle build

## Create `ANDROID_UPLOAD_KEYSTORE_BASE64`

Linux:

```bash
base64 -w 0 /path/to/upload-keystore.jks
```

macOS:

```bash
base64 /path/to/upload-keystore.jks | tr -d '\n'
```

Copy the output into the `ANDROID_UPLOAD_KEYSTORE_BASE64` secret.

## Signing Behaviour

The workflow:

- decodes the keystore into `${GITHUB_WORKSPACE}/.ci/signing/upload-keystore.jks`
- writes `keystore.properties` for:
  - `apps/threshold/src-tauri/gen/android/keystore.properties`
  - `apps/threshold-wear/keystore.properties`
- verifies signatures with `jarsigner` on generated `.aab` and `.apk` files
- removes temporary keystore files at the end of the Android job

## Triggering a Release Build

### Tag-triggered release

1. Ensure your release commit is on `main`.
2. Create and push a tag:

```bash
git tag v0.1.9
git push origin v0.1.9
```

3. Watch `.github/workflows/release-build.yml` in Actions.

### Manual release run

From Actions, run `Release Build`:

- leave `release_tag` empty to derive `v<apps/threshold/package.json version>`
- set `release_tag` (for example `v0.1.9`) to override the derived value

### After build completion

Phone and Wear draft releases are pushed to Google Play's internal track automatically (see below). For anything beyond that -- promoting to a wider track, or if Play deployment isn't configured -- download artefacts from the generated GitHub Release for manual Play Console upload.

### Verifying a downloaded artefact

Every GitHub Release includes a `SHA256SUMS` file with one line per artefact (same naming convention as `liminal-hq/spindle`). To verify a downloaded file hasn't been corrupted or tampered with, download both it and `SHA256SUMS` into the same directory and run `sha256sum -c SHA256SUMS` (Linux/macOS) or `certutil -hashfile <file> SHA256` (Windows) and compare against the matching line.

## Google Play Deployment

The `build-android` job ends with two [`r0adkll/upload-google-play`](https://github.com/r0adkll/upload-google-play) steps, one for the phone app and one for the Wear app. Both push a **draft** release to the `internal` track -- nothing is published automatically. A draft sits in Play Console fully uploaded (binary, release notes, track) but requires a manual "Review release" / publish click, so the whole pipeline can be trusted end-to-end without risking an unreviewed build reaching real users.

Both steps are unconditional no-ops (via their `if:` conditions) until configured, so the workflow stays green for anyone who hasn't set this up.

### Setup required (one-time, done in Google Cloud + Play Console, not in this repo)

1. Enable the Google Play Android Developer API for a Google Cloud project: <https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com>.
2. Create a service account in that project (IAM & Admin -> Service accounts -> Create service account). It doesn't need any GCP IAM roles -- permissions are granted entirely from Play Console in the next step.
3. Create a JSON key for that service account and save the **contents** (not the file path) as the `PLAY_SERVICE_ACCOUNT_JSON` repository secret.
4. In Play Console (Users and permissions), invite the service account's email and grant it access to `ca.liminalhq.threshold`. One grant covers both deploy steps -- see below.

### Play and Wear: one app, one listing, separate release trains

Confirmed via Play Console: phone and Wear are **not** separate apps or listings. Play Console's "Internal testing" track for `ca.liminalhq.threshold` shows two independent release rows -- one tagged "Phones and tablets / Chrome OS / Android XR", one tagged "Wear OS" -- each with its own version code and rollout, but both under the one app. `deriveWearVersionCode` (`tools/release-tui/src/lib/version.ts`) already accounts for this: it adds `1_000_000_000` to the phone's derived version code specifically so the two never collide within the shared package. Both deploy steps above use the same `packageName: ca.liminalhq.threshold` -- no second listing, no second service-account grant, no separate package name to track down.

How does Play know which uploaded bundle belongs to which release row? Not from anything the uploader specifies -- read the action's own source (`edits.ts`): `edits.bundles.upload` and `edits.tracks.update` take no form-factor parameter at all, just `packageName`/`editId`/the raw bundle bytes. Play's backend infers the form factor entirely from the bundle's own manifest (Wear builds declare `<uses-feature android:name="android.hardware.type.watch" />`, per [Android's Wear OS packaging docs](https://developer.android.com/training/wearables/packaging)). The action is a dumb pipe; classification happens Play-side.

**Track _name_ also needs to be right, and it's easy to get wrong.** Wear OS releases (rolled out as "dedicated form factor release tracks" since March 2023) live on separate track IDs computed as `[prefix]:defaultTrackName` -- Wear's prefix is `wear`. The Wear deploy step above uses `tracks: wear:internal`, confirmed by reading real, currently-running production workflows doing this exact thing: [Home Assistant's official Android app](https://github.com/home-assistant/android/blob/master/fastlane/Fastfile) deploys `track: 'wear:internal'` alongside `track: 'internal'` for phone in the same deploy lane, and promotes `wear:internal` -> `wear:beta` -> production in lockstep with the phone's own tracks; [joreilly/Confetti](https://github.com/joreilly/Confetti) does the same. (An earlier version of this doc said `wear:qa` based on Google's own documentation page -- but that came from an AI-summarized fetch of the page that turned out to be unreliable, repeated the same way on a second fetch, which looked like independent confirmation but wasn't. Real, executing production code from multiple unrelated projects is stronger evidence, and corrects it to `wear:internal`.) Still not verified against this app's own Play Console track list -- if wrong, the action fails with a clear "Track(s) could not be found. Available tracks are: ..." error listing the real names, which is the fastest way to confirm or correct it. Worth checking first when we test this end-to-end.

### Play's first-release requirement

The Play Developer API refuses to touch a package that has never had a manual upload through the Play Console UI. `ca.liminalhq.threshold` already has release history for both release trains (confirmed: v0.1.9 is live on the internal track for both phone and Wear), so both deploy steps should work once the secret above is configured.

### Release notes

Play's "What's new" text is completely separate from `RELEASE_NOTES.md` -- see `distribution/README.md` for the convention (500-character limit per locale, `en-CA` only for now). Update both `distribution/whatsnew/whatsnew-en-CA` and `distribution/whatsnew-wear/whatsnew-en-CA` as part of preparing each release; whatever is committed at tag time is what ships to Play verbatim.

## Quick Dry-Run Pattern

To test the workflow wiring:

```bash
git tag v0.0.0-ci-test
git push origin v0.0.0-ci-test
```

After validation:

```bash
git push --delete origin v0.0.0-ci-test
git tag -d v0.0.0-ci-test
```

## Generated Release Notes Labels

Release notes are generated from `.github/release.yml` label categories.

Use these canonical labels on PRs to influence changelog grouping:

- `enhancement` for features
- `bug` for fixes
- `documentation` for docs updates
- `test` for test changes
- `ci` and `build` for pipeline/build changes

To exclude a PR from generated notes, apply one of:

- `skip-changelog`
- `internal`
