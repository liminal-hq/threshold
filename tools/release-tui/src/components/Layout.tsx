// Screen layout skeleton — header, body, footer pattern from the spec
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT


import { Box, Text, useStdout } from 'ink';
import { palette } from '../lib/theme.js';

export interface LayoutProps {
	headerLeft: string;
	headerRight?: string;
	footerLeft: string;
	footerRight?: React.ReactNode;
	footerWarning?: string;
	children: React.ReactNode;
}

function Divider() {
	const { stdout } = useStdout();
	const width = stdout?.columns ?? 80;
	return <Text color={palette.line}>{'-'.repeat(width)}</Text>;
}

export function Layout({
	headerLeft,
	headerRight = 'Threshold Release TUI',
	footerLeft,
	footerRight,
	footerWarning,
	children,
}: LayoutProps) {
	return (
		<Box flexDirection="column" paddingX={1}>
			{/* Header */}
			<Box justifyContent="space-between">
				<Text>{headerLeft}</Text>
				<Text color={palette.magenta}>{headerRight}</Text>
			</Box>
			<Divider />

			{/* Body */}
			<Box flexDirection="column" flexGrow={1}>
				{children}
			</Box>

			{/* Footer */}
			{footerWarning && (
				<Text color={palette.yellow}>{footerWarning}</Text>
			)}
			<Divider />
			<Box justifyContent="space-between">
				<Text color={palette.muted}>{footerLeft}</Text>
				<Text color={palette.muted}>{footerRight}</Text>
			</Box>
		</Box>
	);
}

export { Divider };
