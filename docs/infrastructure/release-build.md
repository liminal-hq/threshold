# Release Build CI

This guide covers the release pipeline in `.github/workflows/release-build.yml`.

## Overview

The release workflow runs when you push a version tag matching `v*`.

It will:

- verify the tagged commit is on `main`
- build desktop artefacts
- build signed Android phone + Wear artefacts (`.aab`, `.apk`)
- collect mapping files and native debug symbols (when available)
- publish a GitHub Release with all artefacts attached

## Container Base Image (`ci-base`)

The workflow runs build jobs in:

- `ghcr.io/<owner>/<repo>/ci-base:latest`

This image is built from `.devcontainer/Dockerfile` and includes most system dependencies used by Tauri and Android builds.

If tooling in `.devcontainer/Dockerfile` changes, rebuild and push `ci-base` before running release tags.

Related workflow:

- `.github/workflows/build-ci-image.yml`

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

1. Ensure your release commit is on `main`.
2. Create and push a tag:

```bash
git tag v0.1.9
git push origin v0.1.9
```

3. Watch `.github/workflows/release-build.yml` in Actions.
4. Download artefacts from the generated GitHub Release for Play Console upload.

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
