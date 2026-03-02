// Help overlay showing all keybindings
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT


import { Box, Text, useInput } from 'ink';
import { Layout } from '../components/Layout.js';
import { palette } from '../lib/theme.js';

interface HelpProps {
	onClose: () => void;
}

export function Help({ onClose }: HelpProps) {
	useInput(() => {
		onClose();
	});

	const pipe = <Text color={palette.line}>|</Text>;

	return (
		<Layout
			headerLeft="Help"
			footerLeft="Help"
			footerRight="Press any key to close"
		>
			<Text> </Text>
			<Box>
				<Box flexDirection="column" width="50%">
					<Text bold> Global keys</Text>
					<Text>   <Text color={palette.accent}>?</Text>          Toggle this help</Text>
					<Text>   <Text color={palette.accent}>q</Text>          Quit without changes</Text>
					<Text>   <Text color={palette.accent}>Ctrl+C</Text>     Quit / abort build</Text>
					<Text> </Text>
					<Text bold> Version bump (Screen 1)</Text>
					<Text>   <Text color={palette.accent}>p</Text>          Patch bump</Text>
					<Text>   <Text color={palette.accent}>n</Text>          Minor bump</Text>
					<Text>   <Text color={palette.accent}>j</Text>          Major bump</Text>
					<Text>   <Text color={palette.accent}>c</Text>          Custom version</Text>
					<Text>   <Text color={palette.accent}>r</Text>          Redo current version</Text>
					<Text>   <Text color={palette.accent}>l</Text>          View release log</Text>
					<Text> </Text>
					<Text bold> Review (Screen 2)</Text>
					<Text>   <Text color={palette.accent}>a</Text>/Enter    Apply all changes</Text>
					<Text>   <Text color={palette.accent}>d</Text>          Toggle detail panel</Text>
					<Text>   <Text color={palette.accent}>b</Text>          Back to version bump</Text>
				</Box>
				<Box flexDirection="column" width="50%">
					<Text> {pipe} <Text bold>Tag conflict (if shown)</Text></Text>
					<Text> {pipe}   <Text color={palette.accent}>u</Text>          Update existing tag</Text>
					<Text> {pipe}   <Text color={palette.accent}>t</Text>          Enter different tag</Text>
					<Text> {pipe}</Text>
					<Text> {pipe} <Text bold>Build (Screen 2.5)</Text></Text>
					<Text> {pipe}   <Text color={palette.accent}>b</Text>          Build phone + wear AABs/APKs</Text>
					<Text> {pipe}   <Text color={palette.accent}>s</Text>          Skip build</Text>
					<Text> {pipe}   <Text color={palette.accent}>r</Text>          Retry failed build</Text>
				</Box>
			</Box>
		</Layout>
	);
}
