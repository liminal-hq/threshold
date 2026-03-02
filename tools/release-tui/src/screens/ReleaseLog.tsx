// Screen 1b — Release log showing recent git tags
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT


import { Box, Text, useInput } from 'ink';
import { Layout, Divider } from '../components/Layout.js';
import { HotkeyBar } from '../components/HotkeyHint.js';
import { palette } from '../lib/theme.js';
import { listLocalReleaseTags } from '../lib/git.js';

interface ReleaseLogProps {
	onBack: () => void;
	onQuit: () => void;
}

export function ReleaseLog({ onBack, onQuit }: ReleaseLogProps) {
	const tags = listLocalReleaseTags();

	useInput((input, key) => {
		if (input === 'b' || key.escape) return onBack();
		if (input === 'q') return onQuit();
	});

	return (
		<Layout
			headerLeft="Release Log"
			footerLeft={`${tags.length} release${tags.length === 1 ? '' : 's'}`}
			footerRight={
				<HotkeyBar
					hints={[
						{ label: 'Back', hotkey: 'b/Esc' },
						{ label: 'Help', hotkey: '?' },
						{ label: 'Quit', hotkey: 'q' },
					]}
				/>
			}
		>
			<Text> </Text>
			<Box>
				<Text bold color={palette.muted}>
					{' '}
					{'Tag'.padEnd(18)}{'Version'.padEnd(14)}{'Date'}
				</Text>
			</Box>
			<Divider />
			{tags.length === 0 ? (
				<Text color={palette.muted}> No release tags found.</Text>
			) : (
				tags.map((tag) => {
					const version = tag.name.startsWith('v') ? tag.name.slice(1) : tag.name;
					return (
						<Text key={tag.name}>
							{' '}
							<Text color={palette.yellow}>{tag.name.padEnd(18)}</Text>
							{version.padEnd(14)}
							<Text color={palette.muted}>{tag.createdAt}</Text>
						</Text>
					);
				})
			)}
		</Layout>
	);
}
