// SemVer parsing, bumping, and version code derivation
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { SEMVER_RE } from './constants.js';

export interface SemVer {
	major: number;
	minor: number;
	patch: number;
	prerelease: string;
}

export type BumpMode = 'patch' | 'minor' | 'major';

export function parseSemver(version: string): SemVer | null {
	const match = version.match(SEMVER_RE);
	if (!match) return null;
	return {
		major: Number.parseInt(match[1], 10),
		minor: Number.parseInt(match[2], 10),
		patch: Number.parseInt(match[3], 10),
		prerelease: match[4] ?? '',
	};
}

export function bumpSemver(version: string, mode: BumpMode): string {
	const parsed = parseSemver(version);
	if (!parsed) throw new Error(`Invalid semver version: ${version}`);
	switch (mode) {
		case 'patch':
			return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
		case 'minor':
			return `${parsed.major}.${parsed.minor + 1}.0`;
		case 'major':
			return `${parsed.major + 1}.0.0`;
	}
}

/** Tauri / Play formula: major*1_000_000 + minor*1_000 + patch */
export function deriveTauriVersionCode(version: string): number {
	const parsed = parseSemver(version);
	if (!parsed) throw new Error(`Invalid semver version: ${version}`);
	return parsed.major * 1_000_000 + parsed.minor * 1_000 + parsed.patch;
}

/** Wear version code = phone version code + 1_000_000_000 (separate Play range). */
export function deriveWearVersionCode(version: string): number {
	return deriveTauriVersionCode(version) + 1_000_000_000;
}

export function isValidSemver(version: string): boolean {
	return SEMVER_RE.test(version);
}
