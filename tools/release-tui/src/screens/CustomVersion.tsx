// Screen 1c — Custom version text input
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { useState } from 'react';
import { Text, useInput } from 'ink';
import { Layout } from '../components/Layout.js';
import { palette } from '../lib/theme.js';
import { isValidSemver } from '../lib/version.js';
import type { CurrentState } from '../lib/files.js';

interface CustomVersionProps {
	currentState: CurrentState;
	onConfirm: (version: string) => void;
	onCancel: () => void;
}

export function CustomVersion({ currentState, onConfirm, onCancel }: CustomVersionProps) {
	const [buffer, setBuffer] = useState('');
	const [error, setError] = useState('');

	useInput((input, key) => {
		if (key.escape) return onCancel();
		if (key.return) {
			if (!isValidSemver(buffer)) {
				setError('Version must be semantic (e.g. 0.2.0 or 0.2.0-rc.1)');
				return;
			}
			return onConfirm(buffer);
		}
		if (key.backspace || key.delete) {
			setBuffer((prev) => prev.slice(0, -1));
			setError('');
			return;
		}
		if (input && !key.ctrl && !key.meta) {
			setBuffer((prev) => prev + input);
			setError('');
		}
	});

	return (
		<Layout
			headerLeft="Step 1 of 3"
			footerLeft="Custom version"
			footerRight="Esc: cancel  Enter: confirm"
		>
			<Text> </Text>
			<Text> Current version    <Text color={palette.text}>{currentState.tauriVersionName}</Text></Text>
			<Text> Wear OS version    <Text color={palette.text}>{currentState.wearVersionName}</Text></Text>
			<Text> Web pkg version    <Text color={palette.text}>{currentState.webVersion}</Text></Text>
			<Text> </Text>
			<Text> Enter version: {buffer}<Text color={palette.accent}>{'\u2588'}</Text></Text>
			{error ? <Text color={palette.yellow}> {error}</Text> : null}
			<Text> </Text>
			<Text color={palette.muted}> Format: X.Y.Z or X.Y.Z-suffix (e.g. 0.2.0, 0.2.0-rc.1)</Text>
		</Layout>
	);
}
