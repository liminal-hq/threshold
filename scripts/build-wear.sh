#!/usr/bin/env bash

set -euo pipefail

WEAR_DIR="apps/threshold-wear"
APK_ROOT="$WEAR_DIR/build/outputs/apk"
DEBUG_APK_DIR="$APK_ROOT/debug"

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

cd "$WEAR_DIR"
./gradlew assembleDebug
cd - >/dev/null

if [ -d "$DEBUG_APK_DIR" ]; then
	echo "${COLOUR_GREEN}Wear debug build complete${COLOUR_RESET}"
	echo "${COLOUR_CYAN}APK directory:${COLOUR_RESET} $DEBUG_APK_DIR"
	echo "${COLOUR_YELLOW}Generated APKs:${COLOUR_RESET}"
	find "$DEBUG_APK_DIR" -type f -name "*.apk" -print | sed "s|^|  ${COLOUR_CYAN}- ${COLOUR_RESET}|"
else
	echo "${COLOUR_RED}Build succeeded, but no debug APK directory was found at:${COLOUR_RESET} $DEBUG_APK_DIR" >&2
	echo "${COLOUR_YELLOW}Available APK output directories under ${APK_ROOT}:${COLOUR_RESET}" >&2
	find "$APK_ROOT" -maxdepth 2 -type d 2>/dev/null || true
	exit 1
fi
