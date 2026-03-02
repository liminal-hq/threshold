// Screen layout skeleton — header, body, footer pattern from the spec
// Takes over the full terminal like vim/mc with footer pinned to bottom.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ReactNode } from 'react';
import { Box, Text, useStdout } from 'ink';
import { palette } from '../lib/theme.js';

export interface LayoutProps {
	headerLeft: string;
	headerRight?: string;
	footerLeft: string;
	footerRight?: ReactNode;
	footerWarning?: string;
	children: ReactNode;
}

function Divider() {
	const { stdout } = useStdout();
	const width = stdout?.columns ?? 80;
	return (
		<Text wrap="truncate" color={palette.line}>
			{'-'.repeat(width)}
		</Text>
	);
}

export function Layout({
	headerLeft,
	headerRight = 'Threshold Release TUI',
	footerLeft,
	footerRight,
	footerWarning,
	children,
}: LayoutProps) {
	const { stdout } = useStdout();
	const height = stdout?.rows ?? 24;

	// Footer takes: optional warning (1) + divider (1) + footer bar (1) = 2-3 lines
	// Header takes: header (1) + divider (1) = 2 lines
	const footerLines = footerWarning ? 3 : 2;
	const bodyHeight = Math.max(1, height - 2 - footerLines);

	return (
		<Box flexDirection="column" height={height}>
			{/* Header */}
			<Box paddingX={1} justifyContent="space-between">
				<Text wrap="truncate">{headerLeft}</Text>
				<Text wrap="truncate" color={palette.magenta}>
					{headerRight}
				</Text>
			</Box>
			<Divider />

			{/* Body — fills remaining space */}
			<Box flexDirection="column" height={bodyHeight} paddingX={1} overflow="hidden">
				{children}
			</Box>

			{/* Footer — pinned to bottom */}
			{footerWarning && (
				<Box paddingX={1}>
					<Text wrap="truncate" color={palette.yellow}>
						{footerWarning}
					</Text>
				</Box>
			)}
			<Divider />
			<Box paddingX={1} justifyContent="space-between">
				<Text wrap="truncate" color={palette.muted}>
					{footerLeft}
				</Text>
				<Text wrap="truncate" color={palette.muted}>
					{footerRight}
				</Text>
			</Box>
		</Box>
	);
}

export { Divider };
