// Screen 3 — Done screens (version only, full release, redo)
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT


import { Box, Text, useInput } from 'ink';
import { Layout, Divider } from '../components/Layout.js';
import { palette } from '../lib/theme.js';
import { fileSize, verifySignature } from '../lib/build.js';
import type { Artifacts } from '../lib/build.js';

interface DoneProps {
	version: string;
	tagName: string;
	filesChanged: number;
	isRedo: boolean;
	artifacts: Artifacts | null;
	onExit: () => void;
}

function ArtifactRow({ label, path, sig }: { label: string; path: string; sig: string | null }) {
	const size = fileSize(path);
	const filename = path.split('/').pop() ?? path;
	const pipe = <Text color={palette.line}>|</Text>;

	return (
		<Text>
			{'   '}{label.padEnd(12)}{size.padEnd(10)}{'release/' + filename.padEnd(30)}{pipe}  {sig ? <Text><Text color={palette.bar}>{'\u2713'}</Text> {sig}</Text> : ''}
		</Text>
	);
}

export function Done({ version, tagName, filesChanged, isRedo, artifacts, onExit }: DoneProps) {
	const commitMsg = isRedo
		? `chore(release): redo release ${version}`
		: `chore(release): bump versions to ${version}`;

	const hasArtifacts = artifacts && (artifacts.phone?.aab || artifacts.wear?.aab);

	useInput((_input, key) => {
		if (key.return) return onExit();
	});

	return (
		<Layout
			headerLeft="Done"
			footerLeft={isRedo ? `Redo complete: ${version}` : hasArtifacts ? `Release complete: ${version}` : 'Complete'}
			footerRight="Press Enter to exit"
		>
			<Text> </Text>
			{!isRedo && filesChanged > 0 && (
				<Text>   <Text color={palette.bar}>{'\u2713'}</Text>  Updated {filesChanged} files</Text>
			)}
			{hasArtifacts ? (
				<Text>   <Text color={palette.bar}>{'\u2713'}</Text>  Created commit: <Text color={palette.text}>{commitMsg}</Text></Text>
			) : (
				<>
					<Text>   <Text color={palette.bar}>{'\u2713'}</Text>  Created commit</Text>
					<Text>      <Text color={palette.text}>{commitMsg}</Text></Text>
				</>
			)}
			{isRedo ? (
				<Text>   <Text color={palette.bar}>{'\u2713'}</Text>  Updated tag <Text color={palette.yellow}>{tagName}</Text> {'\u2192'} HEAD</Text>
			) : (
				<Text>   <Text color={palette.bar}>{'\u2713'}</Text>  Tagged <Text color={palette.yellow}>{tagName}</Text></Text>
			)}

			{hasArtifacts && artifacts && (
				<>
					<Text> </Text>
					<Box>
						<Text> <Text bold>Artifacts</Text>{''.padEnd(45)}<Text color={palette.line}>|</Text>  <Text bold>Signatures</Text></Text>
					</Box>
					<Text> {'-'.repeat(52)} <Text color={palette.line}>|</Text> {'-'.repeat(22)}</Text>
					{artifacts.phone?.aab && (
						<ArtifactRow
							label="Phone AAB"
							path={artifacts.phone.aab}
							sig={verifySignature(artifacts.phone.aab)}
						/>
					)}
					{artifacts.phone?.apk && (
						<ArtifactRow
							label="Phone APK"
							path={artifacts.phone.apk}
							sig={verifySignature(artifacts.phone.apk)}
						/>
					)}
					{artifacts.phone?.symbols && (
						<ArtifactRow
							label="Phone syms"
							path={artifacts.phone.symbols}
							sig={null}
						/>
					)}
					{artifacts.wear?.aab && (
						<ArtifactRow
							label="Wear AAB"
							path={artifacts.wear.aab}
							sig={verifySignature(artifacts.wear.aab)}
						/>
					)}
					{artifacts.wear?.apk && (
						<ArtifactRow
							label="Wear APK"
							path={artifacts.wear.apk}
							sig={verifySignature(artifacts.wear.apk)}
						/>
					)}
					{artifacts.wear?.mapping && (
						<ArtifactRow
							label="Wear map"
							path={artifacts.wear.mapping}
							sig={null}
						/>
					)}
				</>
			)}

			<Text> </Text>
			<Divider />
			<Text> </Text>
			{isRedo ? (
				<Text> <Text color={palette.accent}>Next</Text>    git push origin HEAD && git push origin {tagName} --force</Text>
			) : (
				<Text> <Text color={palette.accent}>Next</Text>   git push origin HEAD && git push origin {tagName}</Text>
			)}
			{hasArtifacts && (
				<>
					<Text> <Text color={palette.accent}>Play</Text>    https://play.google.com/console         (AABs)</Text>
					<Text> <Text color={palette.accent}>GitHub</Text>  Upload APKs to GitHub release            (APKs)</Text>
				</>
			)}
			{!hasArtifacts && !isRedo && (
				<Text> <Text color={palette.accent}>Build</Text>  pnpm build:release</Text>
			)}
			{isRedo ? (
				<>
					<Text> <Text color={palette.red}>Undo</Text>    git reset --soft HEAD~1</Text>
					<Text> </Text>
					<Text color={palette.yellow}> Note: Remote tag update requires --force. Previous tag commit is preserved</Text>
					<Text color={palette.yellow}>       in reflog for 90 days.</Text>
				</>
			) : (
				<Text> <Text color={palette.red}>Undo</Text>   git reset --soft HEAD~1 && git tag -d {tagName}</Text>
			)}
		</Layout>
	);
}
