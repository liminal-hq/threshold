// Screen 2 variant — Tag conflict resolution
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT


import { Text, useInput } from 'ink';
import { Layout, Divider } from '../components/Layout.js';
import { HotkeyBar } from '../components/HotkeyHint.js';
import { palette } from '../lib/theme.js';
import { findLocalTagDate, findLocalTagCommit } from '../lib/git.js';

interface TagConflictProps {
	tagName: string;
	localExists: boolean;
	remoteExists: boolean;
	onUpdate: () => void;
	onRename: () => void;
	onBack: () => void;
	onQuit: () => void;
}

export function TagConflict({
	tagName,
	localExists,
	remoteExists,
	onUpdate,
	onRename,
	onBack,
	onQuit,
}: TagConflictProps) {
	const location = localExists && remoteExists ? 'local + remote' : localExists ? 'local' : 'remote';
	const date = localExists ? findLocalTagDate(tagName) : null;
	const commit = localExists ? findLocalTagCommit(tagName) : null;

	useInput((input, key) => {
		if (input === 'u') return onUpdate();
		if (input === 't') return onRename();
		if (input === 'b') return onBack();
		if (input === 'q' || key.escape) return onQuit();
	});

	return (
		<Layout
			headerLeft="Step 2 of 3"
			footerLeft="Tag conflict"
			footerRight={
				<HotkeyBar hints={[{ label: 'Help', hotkey: '?' }, { label: 'Quit', hotkey: 'q' }]} />
			}
		>
			<Text> </Text>
			<Divider />
			<Text color={palette.yellow}> Tag {tagName} already exists ({location})</Text>
			<Text> Created: <Text color={palette.text}>{date ?? 'unknown'}</Text>    Points to: <Text color={palette.text}>{commit ?? 'unknown'}</Text></Text>
			<Text> </Text>
			<Text>   <Text color={palette.accent}>u</Text>  Update local tag to HEAD</Text>
			<Text>   <Text color={palette.accent}>t</Text>  Enter a different tag name</Text>
			<Text>   <Text color={palette.accent}>b</Text>  Back to version selection</Text>
		</Layout>
	);
}
