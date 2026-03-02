#!/usr/bin/env node
// CLI entry point for the release TUI
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT


import { render } from 'ink';
import process from 'node:process';
import { App } from './App.js';
import { ensureRepoRoot, readCurrentState, applyChanges } from './lib/files.js';
import { bumpSemver, deriveTauriVersionCode, deriveWearVersionCode, isValidSemver } from './lib/version.js';
import { createReleaseCommit, createRedoCommit, applyTag } from './lib/git.js';
import { runFullBuild, fileSize } from './lib/build.js';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
	ci: boolean;
	bump: string | null;
	redo: boolean;
	build: boolean;
	noCommit: boolean;
	noWebSync: boolean;
	dryRun: boolean;
}

function parseCliArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		ci: false,
		bump: null,
		redo: false,
		build: false,
		noCommit: false,
		noWebSync: false,
		dryRun: false,
	};

	for (let i = 2; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--ci') args.ci = true;
		else if (arg === '--bump' && i + 1 < argv.length) args.bump = argv[++i];
		else if (arg === '--redo') args.redo = true;
		else if (arg === '--build') args.build = true;
		else if (arg === '--no-commit') args.noCommit = true;
		else if (arg === '--no-web-sync') args.noWebSync = true;
		else if (arg === '--dry-run') args.dryRun = true;
	}

	return args;
}

// ---------------------------------------------------------------------------
// CI (non-interactive) mode
// ---------------------------------------------------------------------------

async function runCi(cliArgs: CliArgs): Promise<void> {
	ensureRepoRoot();
	const currentState = readCurrentState();

	if (!cliArgs.bump && !cliArgs.redo) {
		console.error('Error: --ci requires --bump <type> or --redo');
		process.exitCode = 1;
		return;
	}

	console.log('Threshold Release TUI (non-interactive)');

	let version: string;
	const isRedo = cliArgs.redo;

	if (isRedo) {
		version = currentState.tauriVersionName;
	} else {
		const bump = cliArgs.bump!;
		if (['patch', 'minor', 'major'].includes(bump)) {
			version = bumpSemver(currentState.tauriVersionName, bump as 'patch' | 'minor' | 'major');
		} else if (isValidSemver(bump)) {
			version = bump;
		} else {
			console.error(`Error: Invalid bump value: ${bump}`);
			process.exitCode = 1;
			return;
		}
	}

	const tagName = `v${version}`;
	const versionCode = deriveTauriVersionCode(version);
	const wearVC = deriveWearVersionCode(version);
	const updateWebVersion = !cliArgs.noWebSync;

	console.log(`Version: ${currentState.tauriVersionName} \u2192 ${version}`);

	if (!cliArgs.dryRun && !isRedo) {
		const nextState = {
			versionName: version,
			tauriDerivedVersionCode: versionCode,
			wearVersionCode: wearVC,
			updateWebVersion,
		};
		const changedFiles = applyChanges(nextState);
		console.log(`Updated: ${changedFiles.join(', ') || '(none)'}`);

		if (!cliArgs.noCommit) {
			const commitMsg = `chore(release): bump versions to ${version}`;
			createReleaseCommit(commitMsg, changedFiles);
			applyTag(tagName);
			console.log(`Commit: ${commitMsg}`);
			console.log(`Tag: ${tagName}`);
		}
	} else if (!cliArgs.dryRun && isRedo) {
		if (!cliArgs.noCommit) {
			const commitMsg = `chore(release): redo release ${version}`;
			createRedoCommit(commitMsg);
			applyTag(tagName, true);
			console.log(`Commit: ${commitMsg}`);
			console.log(`Tag: ${tagName} (force-updated)`);
		}
	} else {
		console.log('(dry-run, no changes applied)');
	}

	if (cliArgs.build && !cliArgs.dryRun) {
		console.log('Building...');
		const artifacts = await runFullBuild(version, versionCode);
		if (artifacts) {
			const parts: string[] = [];
			if (artifacts.phone?.aab) parts.push(`phone AAB (${fileSize(artifacts.phone.aab)})`);
			if (artifacts.phone?.apk) parts.push(`phone APK (${fileSize(artifacts.phone.apk)})`);
			if (artifacts.wear?.aab) parts.push(`wear AAB (${fileSize(artifacts.wear.aab)})`);
			if (artifacts.wear?.apk) parts.push(`wear APK (${fileSize(artifacts.wear.apk)})`);
			console.log(`Build: ${parts.join(', ')}`);
		}
	}

	console.log('Done.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const cliArgs = parseCliArgs(process.argv);

	// CI or non-TTY: plain text mode
	if (cliArgs.ci || !process.stdin.isTTY || !process.stdout.isTTY) {
		await runCi(cliArgs);
		return;
	}

	ensureRepoRoot();

	// Enter alternate screen buffer (like vim/mc)
	process.stdout.write('\x1b[?1049h'); // Alt screen
	process.stdout.write('\x1b[?25l'); // Hide cursor

	const leave = () => {
		process.stdout.write('\x1b[?25h'); // Show cursor
		process.stdout.write('\x1b[?1049l'); // Restore main screen
	};

	process.on('exit', leave);

	try {
		const { waitUntilExit } = render(<App />, {
			exitOnCtrlC: true,
		});

		await waitUntilExit();
	} finally {
		leave();
	}

	// Print one-liner to main terminal on exit
	try {
		const state = readCurrentState();
		console.log(
			`Threshold Release TUI \u2014 ${state.tauriVersionName} (v${state.tauriVersionName})`,
		);
	} catch {
		// Ignore if state reading fails on exit
	}
}

main().catch((error) => {
	console.error(`Error: ${error.message}`);
	process.exitCode = 1;
});
