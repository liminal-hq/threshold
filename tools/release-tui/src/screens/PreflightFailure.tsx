// Screen 2.5 — Pre-flight failure when build prerequisites are missing
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT


import { Text, useInput } from 'ink';
import { Layout } from '../components/Layout.js';
import { HotkeyBar } from '../components/HotkeyHint.js';
import { palette } from '../lib/theme.js';
import type { PreflightCheck } from '../lib/build.js';

interface PreflightFailureProps {
	checks: PreflightCheck[];
	onBack: () => void;
	onQuit: () => void;
}

export function PreflightFailure({ checks, onBack, onQuit }: PreflightFailureProps) {
	useInput((input, key) => {
		if (input === 'b') return onBack();
		if (input === 'q' || key.escape) return onQuit();
	});

	return (
		<Layout
			headerLeft="Pre-flight"
			footerLeft="Build prerequisites failed"
			footerRight={
				<HotkeyBar hints={[{ label: 'Back', hotkey: 'b' }, { label: 'Help', hotkey: '?' }, { label: 'Quit', hotkey: 'q' }]} />
			}
		>
			<Text> </Text>
			<Text> Checking build prerequisites...</Text>
			<Text> </Text>
			{checks.map((check, i) => (
				<Text key={i}>
					{'   '}
					{check.ok ? (
						<Text color={palette.bar}>{'\u2713'}</Text>
					) : (
						<Text color={palette.red}>{'\u2717'}</Text>
					)}
					{'  '}{check.label}
				</Text>
			))}
			<Text> </Text>
			<Text color={palette.yellow}> Setup required:</Text>
			<Text> </Text>
			<Text>   1. On your HOST machine, create ~/threshold-keys/keystore.properties:</Text>
			<Text>        keyAlias=google-play-upload</Text>
			<Text>        password=YOUR_KEYSTORE_PASSWORD</Text>
			<Text>        storeFile=/keys/upload-keystore.jks</Text>
			<Text> </Text>
			<Text>   2. Ensure .devcontainer/devcontainer.json has the /keys mount</Text>
			<Text> </Text>
			<Text>   3. Rebuild your dev container</Text>
		</Layout>
	);
}
