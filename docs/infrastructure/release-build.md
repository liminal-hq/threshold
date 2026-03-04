# Release Build CI

This guide covers the release pipeline in `.github/workflows/release-build.yml`.

## Overview

The release workflow runs from three entry points:

- pushes to `main`
- pushed tags matching `v*`
- manual runs via `workflow_dispatch` (optional `release_tag` input)

It will:

- resolve release metadata in `prepare-release` (`tag_name`, `release_name`)
- verify the target commit is on `main`
- create or reuse the GitHub Release before build jobs run
- build desktop artefacts
- build signed Android phone + Wear artefacts (`.aab`, `.apk`)
- collect mapping files and native debug symbols (when available)
- publish a GitHub Release with curated distributable artefacts attached
- remove existing assets on reruns so release pages stay clean

## Container Base Image (`ci-base`)

The workflow runs build jobs in:

- `ghcr.io/<owner>/<repo>/ci-base:latest`

This image is built from `.devcontainer/Dockerfile` and includes most system dependencies used by Tauri and Android builds.

If tooling in `.devcontainer/Dockerfile` changes, rebuild and push `ci-base` before running release tags.

Related workflow:

- `.github/workflows/build-ci-image.yml`

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

### Main push release candidate

On pushes to `main`, the workflow only releases when `apps/threshold/package.json` changed in that push. The tag is derived from that version as `v<version>`.

### Manual release run

From Actions, run `Release Build`:

- leave `release_tag` empty to derive `v<apps/threshold/package.json version>`
- set `release_tag` (for example `v0.1.9`) to override the derived value

### After build completion

Download artefacts from the generated GitHub Release for Play Console upload.

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
