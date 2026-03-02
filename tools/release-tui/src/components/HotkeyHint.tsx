// Hotkey hint label for footers — renders "Label: k" with accent-coloured key
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT


import { Text } from 'ink';
import { palette } from '../lib/theme.js';

interface HotkeyHintProps {
	label: string;
	hotkey: string;
}

export function HotkeyHint({ label, hotkey }: HotkeyHintProps) {
	return (
		<Text>
			{label}: <Text color={palette.accent}>{hotkey}</Text>
		</Text>
	);
}

export function HotkeyBar({ hints }: { hints: Array<{ label: string; hotkey: string }> }) {
	return (
		<Text>
			{hints.map((h, i) => (
				<Text key={h.hotkey}>
					{i > 0 ? '  ' : ''}
					{h.label}: <Text color={palette.accent}>{h.hotkey}</Text>
				</Text>
			))}
		</Text>
	);
}
