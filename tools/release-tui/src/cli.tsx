#!/usr/bin/env node
// CLI entry point for the release TUI
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT


import { render } from 'ink';
import process from 'node:process';
import { Command, CommanderError } from 'commander';
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

interface CommanderCliOptions {
	ci?: boolean;
	bump?: string;
	redo?: boolean;
	build?: boolean;
	noCommit?: boolean;
	noWebSync?: boolean;
	dryRun?: boolean;
}

interface ParsedCliArgs {
	args: CliArgs | null;
	exitCode: number;
}

function parseCliArgs(argv: string[]): ParsedCliArgs {
	const program = new Command();
	program
		.name('pnpm version:release')
		.description('Threshold release CLI')
		.allowUnknownOption(false)
		.allowExcessArguments(false)
		.showHelpAfterError()
		.exitOverride()
		.option('--ci', 'Run in non-interactive mode')
		.option('--bump <value>', 'Bump type (`patch`, `minor`, `major`) or explicit semver')
		.option('--redo', 'Re-tag and re-commit the current version')
		.option('--build', 'Build phone and Wear artefacts after version step')
		.option('--no-commit', 'Skip commit and tag creation')
		.option('--no-web-sync', 'Skip web package version sync')
		.option('--dry-run', 'Preview actions without writing changes');

	let options: CommanderCliOptions;
	try {
		program.parse(argv, { from: 'node' });
		options = program.opts<CommanderCliOptions>();
	} catch (error) {
		if (error instanceof CommanderError) {
			return { args: null, exitCode: error.code === 'commander.helpDisplayed' ? 0 : 1 };
		}
		throw error;
	}

	const args: CliArgs = {
		ci: Boolean(options.ci),
		bump: options.bump ?? null,
		redo: Boolean(options.redo),
		build: Boolean(options.build),
		noCommit: Boolean(options.noCommit),
		noWebSync: Boolean(options.noWebSync),
		dryRun: Boolean(options.dryRun),
	};

	if (args.redo && args.bump) {
		console.error('error: cannot use --bump and --redo together');
		return { args: null, exitCode: 1 };
	}

	return { args, exitCode: 0 };
}

// ---------------------------------------------------------------------------
// CI (non-interactive) mode
// ---------------------------------------------------------------------------

async function runCi(cliArgs: CliArgs): Promise<void> {
	ensureRepoRoot();
	const currentState = readCurrentState();

	if (!cliArgs.bump && !cliArgs.redo) {
		console.error('Error: --ci requires exactly one of --bump <type> or --redo');
		console.error('Run with --help for usage details.');
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
	const parsed = parseCliArgs(process.argv);
	if (!parsed.args) {
		process.exitCode = parsed.exitCode;
		return;
	}
	const cliArgs = parsed.args;

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
