// Screen 2.5 — Build offer after version commit + tag
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT


import { Text, useInput } from 'ink';
import { Layout } from '../components/Layout.js';
import { HotkeyBar } from '../components/HotkeyHint.js';
import { palette } from '../lib/theme.js';

interface BuildOfferProps {
	version: string;
	tagName: string;
	onBuild: () => void;
	onSkip: () => void;
	onHelp: () => void;
	onQuit: () => void;
}

export function BuildOffer({ version, tagName, onBuild, onSkip, onHelp, onQuit }: BuildOfferProps) {
	useInput((input, key) => {
		if (input === 'b') return onBuild();
		if (input === 's') return onSkip();
		if (input === '?' || (key.shift && input === '/')) return onHelp();
		if (input === 'q') return onQuit();
	});

	return (
		<Layout
			headerLeft="Build"
			footerLeft="Build offer"
			footerRight={
				<HotkeyBar hints={[{ label: 'Help', hotkey: '?' }, { label: 'Quit', hotkey: 'q' }]} />
			}
		>
			<Text> </Text>
			<Text> Version committed and tagged: <Text color={palette.bar}>{version}</Text> (<Text color={palette.yellow}>{tagName}</Text>)</Text>
			<Text> </Text>
			<Text> Build release artifacts now?</Text>
			<Text> </Text>
			<Text>   <Text color={palette.accent}>b</Text>  Build phone + wear AABs/APKs</Text>
			<Text>   <Text color={palette.accent}>s</Text>  Skip (version bump only)</Text>
		</Layout>
	);
}
