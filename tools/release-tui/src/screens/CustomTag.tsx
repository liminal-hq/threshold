// Screen 2b — Custom tag input for resolving tag conflicts
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { useState } from 'react';
import { Text, useInput } from 'ink';
import { Layout } from '../components/Layout.js';
import { palette } from '../lib/theme.js';
import { isValidTagName } from '../lib/git.js';

interface CustomTagProps {
	initialTag: string;
	onConfirm: (tagName: string) => void;
	onCancel: () => void;
}

export function CustomTag({ initialTag, onConfirm, onCancel }: CustomTagProps) {
	const [buffer, setBuffer] = useState(initialTag);
	const [error, setError] = useState('');

	useInput((input, key) => {
		if (key.escape) return onCancel();
		if (key.return) {
			if (!isValidTagName(buffer)) {
				setError('Tag name is invalid. Use a valid git tag format (e.g. v0.2.0-hotfix)');
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
			headerLeft="Step 2 of 3"
			footerLeft="Custom tag"
			footerRight="Esc: cancel  Enter: confirm"
		>
			<Text> </Text>
			<Text> Enter tag name: {buffer}<Text color={palette.accent}>{'\u2588'}</Text></Text>
			{error ? <Text color={palette.yellow}> {error}</Text> : null}
			<Text> </Text>
			<Text color={palette.muted}> Example: v0.2.0-hotfix</Text>
		</Layout>
	);
}
