// Build integration for the release TUI — pre-flight, phone/wear builds, verification
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { BUILD } from './constants.js';
import { deriveWearVersionCode } from './version.js';

// ---------------------------------------------------------------------------
// Pre-flight checks
// ---------------------------------------------------------------------------

export interface PreflightCheck {
	ok: boolean;
	label: string;
}

export function checkPrerequisites(): PreflightCheck[] {
	const checks: PreflightCheck[] = [];

	// NDK
	let ndkHome = process.env.NDK_HOME || process.env.ANDROID_NDK_HOME || '';
	if (!ndkHome && process.env.ANDROID_HOME) {
		const ndkDir = path.join(process.env.ANDROID_HOME, 'ndk');
		if (fs.existsSync(ndkDir)) {
			const versions = fs.readdirSync(ndkDir).sort();
			if (versions.length > 0) {
				ndkHome = path.join(ndkDir, versions[versions.length - 1]);
			}
		}
	}
	checks.push(
		ndkHome && fs.existsSync(ndkHome)
			? { ok: true, label: `NDK found: ${ndkHome}` }
			: { ok: false, label: 'NDK not found (set NDK_HOME or install via sdkmanager)' },
	);

	// Rust targets
	const rustResult = spawnSync('rustup', ['target', 'list', '--installed'], { encoding: 'utf8' });
	const targets = rustResult.status === 0 ? rustResult.stdout : '';
	const needed = [
		'aarch64-linux-android',
		'armv7-linux-androideabi',
		'i686-linux-android',
		'x86_64-linux-android',
	];
	checks.push(
		needed.every((t) => targets.includes(t))
			? { ok: true, label: 'Rust targets: aarch64, armv7, i686, x86_64' }
			: { ok: false, label: 'Missing Rust Android targets (run: rustup target add ...)' },
	);

	// Keystore
	checks.push(
		fs.existsSync(BUILD.keystoreProps)
			? { ok: true, label: `Keystore found: ${BUILD.keystoreProps}` }
			: { ok: false, label: `Keystore not found at ${BUILD.keystoreProps}` },
	);

	return checks;
}

// ---------------------------------------------------------------------------
// Keystore symlinks
// ---------------------------------------------------------------------------

export function symlinkKeystore(): void {
	const phoneTarget = path.join(BUILD.phoneAndroidProject, 'keystore.properties');
	const wearTarget = path.join(BUILD.wearProject, 'keystore.properties');

	for (const target of [phoneTarget, wearTarget]) {
		try {
			if (fs.existsSync(target)) fs.unlinkSync(target);
			fs.symlinkSync(BUILD.keystoreProps, target);
		} catch (err) {
			throw new Error(
				`Failed to symlink keystore to ${target}: ${(err as Error).message}`,
			);
		}
	}
}

export function cleanupKeystoreSymlinks(): void {
	const phoneTarget = path.join(BUILD.phoneAndroidProject, 'keystore.properties');
	const wearTarget = path.join(BUILD.wearProject, 'keystore.properties');
	for (const target of [phoneTarget, wearTarget]) {
		try {
			const stat = fs.lstatSync(target);
			if (stat.isSymbolicLink()) fs.unlinkSync(target);
		} catch {
			// May not exist
		}
	}
}

// ---------------------------------------------------------------------------
// Progress estimation
// ---------------------------------------------------------------------------

interface ProgressPhase {
	pattern: RegExp;
	progress: number;
}

const PHONE_PHASES: ProgressPhase[] = [
	{ pattern: /Compiling/i, progress: 10 },
	{ pattern: /Linking/i, progress: 45 },
	{ pattern: /Bundling.*aab/i, progress: 65 },
	{ pattern: /assembl/i, progress: 78 },
	{ pattern: /Signing|sign/i, progress: 90 },
];

const WEAR_PHASES: ProgressPhase[] = [
	{ pattern: /Compiling|:compile/i, progress: 15 },
	{ pattern: /bundleRelease/i, progress: 55 },
	{ pattern: /assembleRelease/i, progress: 72 },
	{ pattern: /Signing|sign/i, progress: 90 },
];

function estimateProgress(line: string, phases: ProgressPhase[], current: number): number {
	for (const phase of phases) {
		if (phase.pattern.test(line) && phase.progress > current) {
			return phase.progress;
		}
	}
	return current;
}

// ---------------------------------------------------------------------------
// Build runner
// ---------------------------------------------------------------------------

export interface BuildProgress {
	progress: number;
	logLines: string[];
}

export type ProgressCallback = (update: BuildProgress) => void;

export function runBuildCommand(
	cmd: string,
	args: string[],
	phases: ProgressPhase[],
	onProgress?: ProgressCallback,
): Promise<BuildProgress> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		const logLines: string[] = [];
		let progress = 0;

		const processLine = (line: string) => {
			logLines.push(line);
			if (logLines.length > 200) logLines.shift();
			progress = estimateProgress(line, phases, progress);
			onProgress?.({ progress, logLines });
		};

		let stdoutBuf = '';
		child.stdout.on('data', (chunk: Buffer) => {
			stdoutBuf += chunk.toString();
			const lines = stdoutBuf.split('\n');
			stdoutBuf = lines.pop()!;
			for (const l of lines) processLine(l);
		});

		let stderrBuf = '';
		child.stderr.on('data', (chunk: Buffer) => {
			stderrBuf += chunk.toString();
			const lines = stderrBuf.split('\n');
			stderrBuf = lines.pop()!;
			for (const l of lines) processLine(l);
		});

		child.on('close', (code) => {
			if (stdoutBuf) processLine(stdoutBuf);
			if (stderrBuf) processLine(stderrBuf);
			if (code === 0) {
				resolve({ progress: 100, logLines });
			} else {
				reject({ code, progress, logLines });
			}
		});

		child.on('error', (err) => reject({ error: err, progress, logLines }));
	});
}

// ---------------------------------------------------------------------------
// Artifact helpers
// ---------------------------------------------------------------------------

export interface Artifacts {
	phone: {
		aab?: string;
		apk?: string;
		symbols?: string;
	};
	wear: {
		aab?: string;
		apk?: string;
		mapping?: string;
	};
}

function findArtifact(dir: string, extension: string): string | null {
	if (!fs.existsSync(dir)) return null;
	const match = fs.readdirSync(dir).find((f) => f.endsWith(extension));
	return match ? path.join(dir, match) : null;
}

export function fileSize(filePath: string): string {
	try {
		const stat = fs.statSync(filePath);
		const mb = stat.size / (1024 * 1024);
		if (mb >= 1) return `${mb.toFixed(1)} MB`;
		return `${(stat.size / 1024).toFixed(1)} KB`;
	} catch {
		return '?';
	}
}

export function verifySignature(filePath: string): string | null {
	const result = spawnSync('jarsigner', ['-verify', '-verbose', '-certs', filePath], {
		encoding: 'utf8',
		timeout: 30_000,
	});
	if (result.status !== 0) return null;
	const cnMatch = result.stdout.match(/CN=([^,\n]+)/);
	return cnMatch ? `CN=${cnMatch[1].trim()}` : null;
}

// ---------------------------------------------------------------------------
// Full build orchestration
// ---------------------------------------------------------------------------

export interface BuildCallbacks {
	onPhoneProgress?: ProgressCallback;
	onPhoneComplete?: (artifacts: Artifacts['phone']) => void;
	onPhoneError?: (logLines: string[]) => void;
	onWearProgress?: ProgressCallback;
	onWearComplete?: (artifacts: Artifacts['wear']) => void;
	onWearError?: (logLines: string[]) => void;
}

export async function runFullBuild(
	version: string,
	versionCode: number,
	callbacks: BuildCallbacks = {},
): Promise<Artifacts | null> {
	const checks = checkPrerequisites();
	if (!checks.every((c) => c.ok)) return null;

	symlinkKeystore();
	const artifacts: Artifacts = { phone: {}, wear: {} };

	try {
		fs.mkdirSync(BUILD.releaseDir, { recursive: true });

		// Phone build
		try {
			await runBuildCommand('pnpm', ['build:android'], PHONE_PHASES, callbacks.onPhoneProgress);

			const aabDir =
				'apps/threshold/src-tauri/gen/android/app/build/outputs/bundle/universalRelease';
			const aabPath = findArtifact(aabDir, '.aab');
			if (aabPath) {
				const dest = `${BUILD.releaseDir}/app-v${version}-${versionCode}.aab`;
				fs.copyFileSync(aabPath, dest);
				artifacts.phone.aab = dest;
			}

			const apkDir =
				'apps/threshold/src-tauri/gen/android/app/build/outputs/apk/universal/release';
			const apkPath = findArtifact(apkDir, '.apk');
			if (apkPath) {
				const dest = `${BUILD.releaseDir}/app-v${version}-${versionCode}.apk`;
				fs.copyFileSync(apkPath, dest);
				artifacts.phone.apk = dest;
			}

			// Debug symbols
			const symbolsBase =
				'apps/threshold/src-tauri/gen/android/app/build/intermediates/merged_native_libs/universalRelease';
			const libDir = path.join(symbolsBase, 'out', 'lib');
			if (fs.existsSync(libDir)) {
				const dest = `${BUILD.releaseDir}/symbols-v${version}.zip`;
				spawnSync('zip', ['-r', '-q', dest, 'lib/'], {
					cwd: path.join(symbolsBase, 'out'),
				});
				if (fs.existsSync(dest)) artifacts.phone.symbols = dest;
			}

			callbacks.onPhoneComplete?.(artifacts.phone);
		} catch (err: unknown) {
			const buildErr = err as { logLines?: string[] };
			callbacks.onPhoneError?.(buildErr.logLines ?? []);
		}

		// Wear build
		const wearVC = deriveWearVersionCode(version);
		try {
			await runBuildCommand(
				`${BUILD.wearProject}/gradlew`,
				['--project-dir', BUILD.wearProject, 'bundleRelease', 'assembleRelease'],
				WEAR_PHASES,
				callbacks.onWearProgress,
			);

			const wearAabDir = `${BUILD.wearProject}/build/outputs/bundle/release`;
			const wearAabPath = findArtifact(wearAabDir, '.aab');
			if (wearAabPath) {
				const dest = `${BUILD.releaseDir}/wear-v${version}-${wearVC}.aab`;
				fs.copyFileSync(wearAabPath, dest);
				artifacts.wear.aab = dest;
			}

			const wearApkDir = `${BUILD.wearProject}/build/outputs/apk/release`;
			const wearApkPath = findArtifact(wearApkDir, '.apk');
			if (wearApkPath) {
				const dest = `${BUILD.releaseDir}/wear-v${version}-${wearVC}.apk`;
				fs.copyFileSync(wearApkPath, dest);
				artifacts.wear.apk = dest;
			}

			const mappingPath = `${BUILD.wearProject}/build/outputs/mapping/release/mapping.txt`;
			if (fs.existsSync(mappingPath)) {
				const dest = `${BUILD.releaseDir}/wear-mapping-v${version}.txt`;
				fs.copyFileSync(mappingPath, dest);
				artifacts.wear.mapping = dest;
			}

			callbacks.onWearComplete?.(artifacts.wear);
		} catch (err: unknown) {
			const buildErr = err as { logLines?: string[] };
			callbacks.onWearError?.(buildErr.logLines ?? []);
		}

		return artifacts;
	} finally {
		cleanupKeystoreSymlinks();
	}
}
