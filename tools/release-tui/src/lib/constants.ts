// Shared constants for the release TUI
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

/** Version file paths relative to repo root. */
export const PATHS = {
	tauriConf: 'apps/threshold/src-tauri/tauri.conf.json',
	webPackage: 'apps/threshold/package.json',
	wearGradle: 'apps/threshold-wear/build.gradle.kts',
} as const;

export const RELEASE_VERSION_FILES = new Set<string>(Object.values(PATHS));

export const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
export const TAG_RE = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Build-related paths. */
export const BUILD = {
	phoneAndroidProject: 'apps/threshold/src-tauri/gen/android',
	wearProject: 'apps/threshold-wear',
	keystoreProps: '/keys/keystore.properties',
	keysDir: '/keys',
	releaseDir: 'release',
} as const;

export const REPO_ROOT_MARKER = 'pnpm-workspace.yaml';
