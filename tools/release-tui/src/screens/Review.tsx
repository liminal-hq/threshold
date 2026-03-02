// Screen 2 — Review + Apply with toggleable detail panel
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { Layout, Divider } from '../components/Layout.js';
import { HotkeyBar } from '../components/HotkeyHint.js';
import { palette } from '../lib/theme.js';
import { deriveTauriVersionCode, deriveWearVersionCode } from '../lib/version.js';
import { getWorktreeChanges, findUnrelatedChanges } from '../lib/git.js';
import type { CurrentState } from '../lib/files.js';

export interface DraftState {
	mode: 'bump' | 'redo';
	version: string;
	forceTag?: boolean;
	tagOverride?: string;
}

interface ReviewProps {
	currentState: CurrentState;
	draft: DraftState;
	onApply: () => void;
	onBack: () => void;
	onHelp: () => void;
	onQuit: () => void;
}

function DetailPanel({ currentState, draft }: { currentState: CurrentState; draft: DraftState }) {
	const tauriVC = deriveTauriVersionCode(draft.version);
	const wearVC = deriveWearVersionCode(draft.version);
	const isRedo = draft.mode === 'redo';

	return (
		<Box flexDirection="column">
			<Text bold color={palette.muted}>  Details</Text>
			<Divider />
			<Text> </Text>
			<Text color={palette.accent}>  tauri.conf.json</Text>
			<Text>    version           <Text color={palette.red}>{currentState.tauriVersionName}</Text> <Text color={palette.muted}>{'\u2192'}</Text> <Text color={palette.bar}>{draft.version}</Text></Text>
			{!isRedo && (
				<Text>    android vCode     <Text color={palette.red}>{currentState.tauriDerivedVersionCode}</Text> <Text color={palette.muted}>{'\u2192'}</Text> <Text color={palette.bar}>{tauriVC}</Text></Text>
			)}
			<Text> </Text>
			<Text color={palette.accent}>  build.gradle.kts</Text>
			<Text>    versionName       <Text color={palette.red}>{currentState.wearVersionName}</Text> <Text color={palette.muted}>{'\u2192'}</Text> <Text color={palette.bar}>{draft.version}</Text></Text>
			{!isRedo && (
				<Text>    versionCode       <Text color={palette.red}>{currentState.wearVersionCode}</Text> <Text color={palette.muted}>{'\u2192'}</Text> <Text color={palette.bar}>{wearVC}</Text></Text>
			)}
			<Text> </Text>
			<Text color={palette.accent}>  package.json</Text>
			<Text>    version           <Text color={palette.red}>{currentState.webVersion}</Text> <Text color={palette.muted}>{'\u2192'}</Text> <Text color={palette.bar}>{draft.version}</Text></Text>
		</Box>
	);
}

export function Review({ currentState, draft, onApply, onBack, onHelp, onQuit }: ReviewProps) {
	const [showDetails, setShowDetails] = useState(false);
	const { stdout } = useStdout();
	const isRedo = draft.mode === 'redo';
	const tagName = draft.tagOverride ?? `v${draft.version}`;
	const commitMsg = isRedo
		? `chore(release): redo release ${draft.version}`
		: `chore(release): bump versions to ${draft.version}`;
	const filesChanged = isRedo ? 0 : 3;

	// Check for unrelated changes
	const worktreeChanges = getWorktreeChanges();
	const unrelated = findUnrelatedChanges(worktreeChanges);
	let warningText = '';
	if (unrelated.length > 0) {
		const sample = unrelated.slice(0, 2).map((c) => `${c.xy.trim()} ${c.path}`);
		const extra = unrelated.length > 2 ? `, +${unrelated.length - 2} more` : '';
		warningText = `Warning: ${unrelated.length} unrelated changes in worktree (${sample.join(', ')}${extra})`;
	}

	useInput((input, key) => {
		if (input === 'q' || key.escape) return onQuit();
		if (input === '?' || (key.shift && input === '/')) return onHelp();
		if (input === 'a' || key.return) return onApply();
		if (input === 'd') return setShowDetails((prev) => !prev);
		if (input === 'b') return onBack();
	});

	const wide = (stdout?.columns ?? 80) >= 100;

	return (
		<Layout
			headerLeft="Step 2 of 3"
			footerLeft={isRedo ? 'Review (redo)' : 'Review'}
			footerRight={
				<HotkeyBar
					hints={[
						{ label: 'Apply', hotkey: 'a/Enter' },
						{ label: 'Details', hotkey: 'd' },
						{ label: 'Back', hotkey: 'b' },
						{ label: 'Help', hotkey: '?' },
						{ label: 'Quit', hotkey: 'q' },
					]}
				/>
			}
			footerWarning={warningText}
		>
			<Box>
				{/* Left panel — compact summary */}
				<Box flexDirection="column" flexGrow={1}>
					<Text> </Text>
					{isRedo ? (
						<Text> Version        <Text color={palette.text}>{draft.version} (unchanged)</Text></Text>
					) : (
						<Text> Version        <Text color={palette.red}>{currentState.tauriVersionName}</Text> <Text color={palette.muted}>{'\u2192'}</Text> <Text color={palette.bar}>{draft.version}</Text></Text>
					)}
					{isRedo ? (
						<Text> Tag            <Text color={palette.yellow}>{tagName}</Text> <Text color={palette.muted}>{'\u2192'} update to HEAD</Text></Text>
					) : (
						<Text> Tag            <Text color={palette.yellow}>{tagName}</Text></Text>
					)}
					<Text> Commit         <Text color={palette.text}>{commitMsg}</Text></Text>
					<Text> Files          <Text color={palette.text}>{filesChanged} updated</Text></Text>
					<Text> Build          <Text color={palette.muted}>ready (phone AAB/APK + wear AAB/APK)</Text></Text>
					{isRedo && (
						<>
							<Text> </Text>
							<Text color={palette.yellow}> Note: This will force-update the local {tagName} tag to the current commit.</Text>
						</>
					)}
				</Box>

				{/* Right panel — detail panel (when toggled) */}
				{showDetails && wide && (
					<Box flexDirection="column" width="50%">
						<Text color={palette.line}>|</Text>
						<DetailPanel currentState={currentState} draft={draft} />
					</Box>
				)}
			</Box>

			{/* Detail panel below on narrow terminals */}
			{showDetails && !wide && (
				<Box flexDirection="column">
					<Text> </Text>
					<DetailPanel currentState={currentState} draft={draft} />
				</Box>
			)}
		</Layout>
	);
}
