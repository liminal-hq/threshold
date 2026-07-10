#!/usr/bin/env bash
# Builds an isolated "Threshold Dev" debug APK for side-by-side testing
#
# (c) Copyright 2026 Liminal HQ, Scott Morris
# SPDX-License-Identifier: Apache-2.0 OR MIT

# Builds an isolated "Threshold Dev" debug APK (ca.liminalhq.threshold.dev), installable
# side-by-side with a real release install, using the shared tauri-dev-mobile container
# so no local Android SDK/NDK setup is needed. gen/android is generated and tracked for
# the real app's identifier, so this regenerates it for the .dev identifier, builds, then
# always restores it back to the committed (real-app) state afterward -- even on failure.
#
# Builds a single-ABI APK by default (aarch64 -- virtually all modern Android phones) to
# keep the install small; a "universal" all-ABI debug build easily runs 800MB+ unstripped,
# which can exceed a phone's free storage outright. Override with:
#   THRESHOLD_DEV_TARGET=universal scripts/build-android-dev.sh
#
# The Android debug keystore (~/.android/debug.keystore) is persisted in its own volume --
# without that, each fresh `docker run --rm` would auto-generate a new random debug key,
# so every build would be signed differently and `adb install -r` over a previous run's
# install would fail with a signature mismatch instead of updating in place.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="ghcr.io/liminal-hq/tauri-dev-mobile:latest"
DEV_IDENTIFIER="ca.liminalhq.threshold.dev"
DEV_CONFIG="{\"identifier\":\"$DEV_IDENTIFIER\",\"productName\":\"Threshold Dev\"}"
OUT_DIR="${THRESHOLD_DEV_APK_DIR:-$HOME/threshold-dev-builds}"
GEN_ANDROID="apps/threshold/src-tauri/gen/android"
TARGET="${THRESHOLD_DEV_TARGET:-aarch64}"

if [ -t 1 ]; then
	COLOUR_RESET=$'\033[0m'
	COLOUR_GREEN=$'\033[32m'
	COLOUR_RED=$'\033[31m'
	COLOUR_CYAN=$'\033[36m'
	COLOUR_YELLOW=$'\033[33m'
else
	COLOUR_RESET=""
	COLOUR_GREEN=""
	COLOUR_RED=""
	COLOUR_CYAN=""
	COLOUR_YELLOW=""
fi

restore_gen_android() {
	echo "${COLOUR_YELLOW}Restoring ${GEN_ANDROID} to its committed (real-app) state...${COLOUR_RESET}"
	git -C "$REPO_ROOT" checkout -- "$GEN_ANDROID" 2>/dev/null || true
	git -C "$REPO_ROOT" clean -fd "$GEN_ANDROID" >/dev/null 2>&1 || true
}

# This script force-restores gen/android to HEAD when it's done (see restore_gen_android
# above), which would silently discard any real uncommitted work under that tree -- not just
# its own regeneration. Refuse to run rather than risk losing an in-progress edit.
if [ -n "$(git -C "$REPO_ROOT" status --porcelain -- "$GEN_ANDROID")" ]; then
	echo "${COLOUR_RED}${GEN_ANDROID} has uncommitted changes -- commit, stash, or discard them before running this script.${COLOUR_RESET}" >&2
	echo "This script force-restores that directory to HEAD when it finishes, which would discard them." >&2
	exit 1
fi

trap restore_gen_android EXIT

mkdir -p "$OUT_DIR"

BUILD_TARGET_ARG=""
if [ "$TARGET" != "universal" ]; then
	BUILD_TARGET_ARG="--target $TARGET"
fi

docker run --rm \
	-v "$REPO_ROOT:/workspace" \
	-v threshold-android-gradle-cache:/home/vscode/.gradle \
	-v threshold-android-cargo-cache:/home/vscode/.cargo/registry \
	-v threshold-android-keystore:/home/vscode/.android \
	-w /workspace \
	"$IMAGE" \
	bash -c "
		set -e
		rm -rf '$GEN_ANDROID'
		pnpm --filter threshold tauri android init --config '$DEV_CONFIG'
		pnpm --filter threshold tauri android build --debug $BUILD_TARGET_ARG --config '$DEV_CONFIG'
	"

APK_SRC="$(find "$REPO_ROOT/$GEN_ANDROID/app/build/outputs/apk" -type f -name '*-debug.apk' -path '*/debug/*' | head -1)"
if [ -z "$APK_SRC" ] || [ ! -f "$APK_SRC" ]; then
	echo "${COLOUR_RED}Build reported success, but no debug APK was found under:${COLOUR_RESET} $REPO_ROOT/$GEN_ANDROID/app/build/outputs/apk" >&2
	exit 1
fi

APK_DEST="$OUT_DIR/threshold-dev-$(date +%Y%m%d-%H%M).apk"
cp "$APK_SRC" "$APK_DEST"
echo "${COLOUR_GREEN}Dev APK ready:${COLOUR_RESET} $APK_DEST"

if command -v adb >/dev/null 2>&1 && adb devices 2>/dev/null | grep -q "device$"; then
	echo "${COLOUR_CYAN}Device detected, installing...${COLOUR_RESET}"
	adb install -r "$APK_DEST"
else
	echo "${COLOUR_YELLOW}No device detected. Install manually with:${COLOUR_RESET} adb install $APK_DEST"
fi
