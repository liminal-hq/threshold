// Screen 1 — Version bump selection with single-key hotkeys
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT


import { Box, Text, useInput } from 'ink';
import { Layout } from '../components/Layout.js';
import { HotkeyBar } from '../components/HotkeyHint.js';
import { palette } from '../lib/theme.js';
import { bumpSemver } from '../lib/version.js';
import type { CurrentState } from '../lib/files.js';

export type BumpSelection =
	| { mode: 'bump'; version: string }
	| { mode: 'redo'; version: string };

interface VersionBumpProps {
	currentState: CurrentState;
	onSelect: (selection: BumpSelection) => void;
	onHelp: () => void;
	onReleaseLog: () => void;
	onQuit: () => void;
}

export function VersionBump({
	currentState,
	onSelect,
	onHelp,
	onReleaseLog,
	onQuit,
}: VersionBumpProps) {
	const ver = currentState.tauriVersionName;
	const patchVer = bumpSemver(ver, 'patch');
	const minorVer = bumpSemver(ver, 'minor');
	const majorVer = bumpSemver(ver, 'major');

	useInput((input, key) => {
		if (input === 'q' || key.escape) return onQuit();
		if (input === '?' || (key.shift && input === '/')) return onHelp();
		if (input === 'l') return onReleaseLog();
		if (input === 'p') return onSelect({ mode: 'bump', version: patchVer });
		if (input === 'n') return onSelect({ mode: 'bump', version: minorVer });
		if (input === 'j') return onSelect({ mode: 'bump', version: majorVer });
		if (input === 'c') return onSelect({ mode: 'bump', version: '' }); // triggers custom input
		if (input === 'r') return onSelect({ mode: 'redo', version: ver });
	});

	return (
		<Layout
			headerLeft="Step 1 of 3"
			footerLeft="Version bump"
			footerRight={
				<HotkeyBar
					hints={[
						{ label: 'History', hotkey: 'l' },
						{ label: 'Help', hotkey: '?' },
						{ label: 'Quit', hotkey: 'q' },
					]}
				/>
			}
		>
			<Text> </Text>
			<Text> Current version    <Text color={palette.text}>{ver}</Text></Text>
			<Text> Wear OS version    <Text color={palette.text}>{currentState.wearVersionName}</Text></Text>
			<Text> Web pkg version    <Text color={palette.text}>{currentState.webVersion}</Text></Text>
			<Text> </Text>
			<Box flexDirection="column">
				<Text>   <Text color={palette.accent}>p</Text>  Patch      <Text color={palette.cyan}>{'\u2192'} {patchVer}</Text></Text>
				<Text>   <Text color={palette.accent}>n</Text>  Minor      <Text color={palette.cyan}>{'\u2192'} {minorVer}</Text></Text>
				<Text>   <Text color={palette.accent}>j</Text>  Major      <Text color={palette.cyan}>{'\u2192'} {majorVer}</Text></Text>
				<Text>   <Text color={palette.accent}>c</Text>  Custom</Text>
				<Text>   <Text color={palette.accent}>r</Text>  Redo {ver}   <Text color={palette.muted}>(re-tag, rebuild)</Text></Text>
			</Box>
		</Layout>
	);
}
