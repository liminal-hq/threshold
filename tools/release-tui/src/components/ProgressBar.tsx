// Progress bar component for build progress
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT


import { Text } from 'ink';
import { palette } from '../lib/theme.js';

interface ProgressBarProps {
	progress: number;
	width?: number;
}

export function ProgressBar({ progress, width = 48 }: ProgressBarProps) {
	const clamped = Math.max(0, Math.min(100, progress));
	const filled = Math.round((clamped / 100) * width);
	const empty = width - filled;

	return (
		<Text>
			{'  '}
			<Text color={palette.line}>{'\u250c'}{'\u2500'.repeat(width)}{'\u2510'}</Text>
			{'\n'}
			{'  '}
			<Text color={palette.line}>{'\u2502'}</Text>
			<Text color={palette.bar}>{'\u2588'.repeat(filled)}</Text>
			<Text color={palette.line}>{'\u2591'.repeat(empty)}</Text>
			<Text color={palette.line}>{'\u2502'}</Text>
			{'  '}
			<Text>{clamped}%</Text>
			{'\n'}
			{'  '}
			<Text color={palette.line}>{'\u2514'}{'\u2500'.repeat(width)}{'\u2518'}</Text>
		</Text>
	);
}
