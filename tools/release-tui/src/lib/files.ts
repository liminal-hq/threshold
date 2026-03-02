// Version file I/O for the release TUI
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import fs from 'node:fs';
import path from 'node:path';
import { PATHS, REPO_ROOT_MARKER } from './constants.js';
import { deriveTauriVersionCode } from './version.js';

/**
 * Walk up from cwd until we find the repo root marker, then chdir there.
 * This lets the TUI work regardless of which directory pnpm invokes it from.
 */
export function ensureRepoRoot(): void {
	// Already at root?
	if (fs.existsSync(path.resolve(REPO_ROOT_MARKER))) return;

	// Walk up
	let dir = process.cwd();
	while (true) {
		const candidate = path.join(dir, REPO_ROOT_MARKER);
		if (fs.existsSync(candidate)) {
			process.chdir(dir);
			return;
		}
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	throw new Error('Could not find the repository root (looked for pnpm-workspace.yaml)');
}

function readJson(filePath: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath: string, data: Record<string, unknown>): void {
	fs.writeFileSync(filePath, `${JSON.stringify(data, null, '\t')}\n`, 'utf8');
}

function parseWearVersionName(gradleText: string): string {
	const match = gradleText.match(/versionName\s*=\s*"([^"]+)"/);
	if (!match) throw new Error(`Could not find versionName in ${PATHS.wearGradle}`);
	return match[1];
}

function parseWearVersionCode(gradleText: string): number {
	const match = gradleText.match(/versionCode\s*=\s*(\d+)/);
	if (!match) throw new Error(`Could not find versionCode in ${PATHS.wearGradle}`);
	return Number.parseInt(match[1], 10);
}

export interface CurrentState {
	tauriVersionName: string;
	tauriVersionCode: number | null;
	tauriDerivedVersionCode: number;
	webVersion: string;
	wearVersionName: string;
	wearVersionCode: number;
}

export function readCurrentState(): CurrentState {
	const tauriConf = readJson(PATHS.tauriConf) as {
		version: string;
		bundle?: { android?: { versionCode?: number } };
	};
	const webPackage = readJson(PATHS.webPackage) as { version: string };
	const wearGradle = fs.readFileSync(PATHS.wearGradle, 'utf8');

	return {
		tauriVersionName: tauriConf.version,
		tauriVersionCode: tauriConf.bundle?.android?.versionCode ?? null,
		tauriDerivedVersionCode: deriveTauriVersionCode(tauriConf.version),
		webVersion: webPackage.version,
		wearVersionName: parseWearVersionName(wearGradle),
		wearVersionCode: parseWearVersionCode(wearGradle),
	};
}

export interface NextState {
	versionName: string;
	tauriDerivedVersionCode: number;
	wearVersionCode: number;
	updateWebVersion: boolean;
}

export function applyChanges(nextState: NextState): string[] {
	const changedFiles: string[] = [];

	// Tauri conf
	const tauriConf = readJson(PATHS.tauriConf) as Record<string, unknown>;
	const tauriBefore = JSON.stringify(tauriConf);
	(tauriConf as { version: string }).version = nextState.versionName;
	const bundle = tauriConf.bundle as { android?: { versionCode?: number } } | undefined;
	if (bundle?.android?.versionCode != null) {
		bundle.android.versionCode = nextState.tauriDerivedVersionCode;
	}
	if (JSON.stringify(tauriConf) !== tauriBefore) {
		writeJson(PATHS.tauriConf, tauriConf);
		changedFiles.push(PATHS.tauriConf);
	}

	// Wear Gradle
	const wearGradle = fs.readFileSync(PATHS.wearGradle, 'utf8');
	const updatedWear = wearGradle
		.replace(/versionName\s*=\s*"[^"]+"/, `versionName = "${nextState.versionName}"`)
		.replace(/versionCode\s*=\s*\d+/, `versionCode = ${nextState.wearVersionCode}`);
	if (updatedWear !== wearGradle) {
		fs.writeFileSync(PATHS.wearGradle, updatedWear, 'utf8');
		changedFiles.push(PATHS.wearGradle);
	}

	// Web package
	if (nextState.updateWebVersion) {
		const webPkg = readJson(PATHS.webPackage);
		const webBefore = JSON.stringify(webPkg);
		(webPkg as { version: string }).version = nextState.versionName;
		if (JSON.stringify(webPkg) !== webBefore) {
			writeJson(PATHS.webPackage, webPkg);
			changedFiles.push(PATHS.webPackage);
		}
	}

	return changedFiles;
}
