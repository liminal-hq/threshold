// Screen 2.5 — Build progress with live progress bars and scrolling log
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT


import { Box, Text } from 'ink';
import { Layout, Divider } from '../components/Layout.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { palette } from '../lib/theme.js';

export interface PhaseStatus {
	building: boolean;
	done: boolean;
	failed: boolean;
	progress: number;
	size?: string;
	apkSize?: string;
	elapsed?: string;
}

interface BuildProgressProps {
	phoneStatus: PhaseStatus;
	wearStatus: PhaseStatus;
	logLines: string[];
}

export function BuildProgressScreen({ phoneStatus, wearStatus, logLines }: BuildProgressProps) {
	const buildingWhat = phoneStatus.building
		? 'phone AAB/APK'
		: wearStatus.building
			? 'wear AAB/APK'
			: '...';

	return (
		<Layout
			headerLeft="Building"
			footerLeft={`Building ${buildingWhat}...`}
			footerRight="Abort: Ctrl+C  Quit: q"
		>
			<Text> </Text>

			{/* Phone section */}
			{phoneStatus.done ? (
				<Box flexDirection="column">
					<Text> <Text color={palette.bar}>{'\u2713'}</Text> Phone AAB                                          {phoneStatus.size ?? ''}  {phoneStatus.elapsed ?? ''}</Text>
					{phoneStatus.apkSize && (
						<Text> <Text color={palette.bar}>{'\u2713'}</Text> Phone APK                                          {phoneStatus.apkSize}</Text>
					)}
				</Box>
			) : phoneStatus.building ? (
				<Box flexDirection="column">
					<Text> <Text color={palette.accent}>{'\u25b8'}</Text> Phone AAB/APK                                            <Text color={palette.cyan}>Building...</Text></Text>
					<ProgressBar progress={phoneStatus.progress} />
				</Box>
			) : phoneStatus.failed ? (
				<Text> <Text color={palette.red}>{'\u2717'}</Text> Phone AAB/APK                                            <Text color={palette.red}>FAILED</Text></Text>
			) : (
				<Text>   Phone AAB/APK                                             <Text color={palette.muted}>Waiting...</Text></Text>
			)}

			<Text> </Text>

			{/* Wear section */}
			{wearStatus.done ? (
				<Box flexDirection="column">
					<Text> <Text color={palette.bar}>{'\u2713'}</Text> Wear AAB                                           {wearStatus.size ?? ''}  {wearStatus.elapsed ?? ''}</Text>
					{wearStatus.apkSize && (
						<Text> <Text color={palette.bar}>{'\u2713'}</Text> Wear APK                                           {wearStatus.apkSize}</Text>
					)}
				</Box>
			) : wearStatus.building ? (
				<Box flexDirection="column">
					<Text> <Text color={palette.accent}>{'\u25b8'}</Text> Wear AAB/APK                                             <Text color={palette.cyan}>Building...</Text></Text>
					<ProgressBar progress={wearStatus.progress} />
				</Box>
			) : wearStatus.failed ? (
				<Text> <Text color={palette.red}>{'\u2717'}</Text> Wear AAB/APK                                             <Text color={palette.red}>FAILED</Text></Text>
			) : (
				<Text>   Wear AAB/APK                                              <Text color={palette.muted}>Waiting...</Text></Text>
			)}

			{/* Build log */}
			<Text> </Text>
			<Divider />
			<Text color={palette.muted}> Build log (last 3 lines):</Text>
			<Text> </Text>
			{logLines.slice(-3).map((line, i) => (
				<Text key={i} color={palette.muted}> {line.slice(0, 78)}</Text>
			))}
		</Layout>
	);
}
