// Main TUI application — screen state machine and navigation
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { useState, useCallback } from 'react';
import { useApp } from 'ink';
import { readCurrentState, applyChanges } from './lib/files.js';
import { deriveTauriVersionCode, deriveWearVersionCode } from './lib/version.js';
import {
	createReleaseCommit,
	createRedoCommit,
	applyTag,
	tagExistsLocally,
	tagExistsOnOrigin,
} from './lib/git.js';
import { checkPrerequisites, runFullBuild } from './lib/build.js';
import type { Artifacts } from './lib/build.js';
import type { CurrentState } from './lib/files.js';
import type { DraftState } from './screens/Review.js';
import type { PhaseStatus } from './screens/BuildProgress.js';

import { VersionBump } from './screens/VersionBump.js';
import { CustomVersion } from './screens/CustomVersion.js';
import { ReleaseLog } from './screens/ReleaseLog.js';
import { Review } from './screens/Review.js';
import { TagConflict } from './screens/TagConflict.js';
import { BuildOffer } from './screens/BuildOffer.js';
import { BuildProgressScreen } from './screens/BuildProgress.js';
import { PreflightFailure } from './screens/PreflightFailure.js';
import { Done } from './screens/Done.js';
import { Help } from './screens/Help.js';
import type { PreflightCheck } from './lib/build.js';

type Screen =
	| 'version-bump'
	| 'custom-version'
	| 'release-log'
	| 'review'
	| 'tag-conflict'
	| 'build-offer'
	| 'build-progress'
	| 'preflight-failure'
	| 'done'
	| 'help';

export interface AppProps {
	/** Override initial state for testing. */
	initialState?: CurrentState;
}

export function App({ initialState }: AppProps) {
	const { exit } = useApp();
	const [screen, setScreen] = useState<Screen>('version-bump');
	const [prevScreen, setPrevScreen] = useState<Screen>('version-bump');
	const [currentState] = useState<CurrentState>(() => initialState ?? readCurrentState());
	const [draft, setDraft] = useState<DraftState>({ mode: 'bump', version: '' });
	const [filesChanged, setFilesChanged] = useState(0);
	const [artifacts, setArtifacts] = useState<Artifacts | null>(null);
	const [tagName, setTagName] = useState('');
	const [preflightChecks, setPreflightChecks] = useState<PreflightCheck[]>([]);

	// Build progress state
	const [phoneStatus, setPhoneStatus] = useState<PhaseStatus>({
		building: false, done: false, failed: false, progress: 0,
	});
	const [wearStatus, setWearStatus] = useState<PhaseStatus>({
		building: false, done: false, failed: false, progress: 0,
	});
	const [buildLogLines, setBuildLogLines] = useState<string[]>([]);

	const quit = useCallback(() => {
		exit();
	}, [exit]);

	const showHelp = useCallback(() => {
		setPrevScreen(screen);
		setScreen('help');
	}, [screen]);

	const handleVersionSelect = useCallback(
		(selection: { mode: 'bump' | 'redo'; version: string }) => {
			if (selection.mode === 'bump' && selection.version === '') {
				// Custom version
				setDraft({ mode: 'bump', version: '' });
				setScreen('custom-version');
				return;
			}
			setDraft({ mode: selection.mode, version: selection.version });
			setScreen('review');
		},
		[],
	);

	const handleCustomVersion = useCallback((version: string) => {
		setDraft({ mode: 'bump', version });
		setScreen('review');
	}, []);

	const handleApply = useCallback(() => {
		const isRedo = draft.mode === 'redo';
		const tag = draft.tagOverride ?? `v${draft.version}`;

		// Check for tag conflict before applying (skip for redo — it always force-tags)
		if (!isRedo && !draft.forceTag) {
			const localExists = tagExistsLocally(tag);
			const remoteExists = tagExistsOnOrigin(tag);
			if (localExists || remoteExists) {
				setTagName(tag);
				setScreen('tag-conflict');
				return;
			}
		}

		setTagName(tag);
		const versionCode = deriveTauriVersionCode(draft.version);
		const wearVC = deriveWearVersionCode(draft.version);

		if (!isRedo) {
			const nextState = {
				versionName: draft.version,
				tauriDerivedVersionCode: versionCode,
				wearVersionCode: wearVC,
				updateWebVersion: true,
			};
			const changed = applyChanges(nextState);
			setFilesChanged(changed.length);

			const commitMsg = `chore(release): bump versions to ${draft.version}`;
			createReleaseCommit(commitMsg, changed);

			const forceTag = draft.forceTag ?? false;
			applyTag(tag, forceTag);
		} else {
			const commitMsg = `chore(release): redo release ${draft.version}`;
			createRedoCommit(commitMsg);
			applyTag(tag, true);
			setFilesChanged(0);
		}

		setScreen('build-offer');
	}, [draft]);

	const handleBuild = useCallback(async () => {
		const checks = checkPrerequisites();
		if (!checks.every((c) => c.ok)) {
			setPreflightChecks(checks);
			setScreen('preflight-failure');
			return;
		}

		setScreen('build-progress');
		setPhoneStatus({ building: true, done: false, failed: false, progress: 0 });
		setWearStatus({ building: false, done: false, failed: false, progress: 0 });
		setBuildLogLines([]);

		const versionCode = deriveTauriVersionCode(draft.version);
		const result = await runFullBuild(draft.version, versionCode, {
			onPhoneProgress: (update) => {
				setPhoneStatus((prev) => ({ ...prev, progress: update.progress }));
				setBuildLogLines(update.logLines.slice(-20));
			},
			onPhoneComplete: (phone) => {
				setPhoneStatus({
					building: false,
					done: true,
					failed: false,
					progress: 100,
					size: phone.aab ? undefined : undefined,
				});
				setWearStatus((prev) => ({ ...prev, building: true }));
			},
			onPhoneError: (logLines) => {
				setPhoneStatus((prev) => ({ ...prev, building: false, failed: true }));
				setBuildLogLines(logLines.slice(-20));
			},
			onWearProgress: (update) => {
				setWearStatus((prev) => ({ ...prev, progress: update.progress }));
				setBuildLogLines(update.logLines.slice(-20));
			},
			onWearComplete: () => {
				setWearStatus({
					building: false,
					done: true,
					failed: false,
					progress: 100,
				});
			},
			onWearError: (logLines) => {
				setWearStatus((prev) => ({ ...prev, building: false, failed: true }));
				setBuildLogLines(logLines.slice(-20));
			},
		});

		setArtifacts(result);
		setScreen('done');
	}, [draft]);

	const handleSkipBuild = useCallback(() => {
		setArtifacts(null);
		setScreen('done');
	}, []);

	// Render current screen
	switch (screen) {
		case 'version-bump':
			return (
				<VersionBump
					currentState={currentState}
					onSelect={handleVersionSelect}
					onHelp={showHelp}
					onReleaseLog={() => setScreen('release-log')}
					onQuit={quit}
				/>
			);

		case 'custom-version':
			return (
				<CustomVersion
					currentState={currentState}
					onConfirm={handleCustomVersion}
					onCancel={() => setScreen('version-bump')}
				/>
			);

		case 'release-log':
			return <ReleaseLog onBack={() => setScreen('version-bump')} onQuit={quit} />;

		case 'review':
			return (
				<Review
					currentState={currentState}
					draft={draft}
					onApply={handleApply}
					onBack={() => setScreen('version-bump')}
					onHelp={showHelp}
					onQuit={quit}
				/>
			);

		case 'tag-conflict':
			return (
				<TagConflict
					tagName={tagName}
					localExists={tagExistsLocally(tagName)}
					remoteExists={tagExistsOnOrigin(tagName)}
					onUpdate={() => {
						setDraft((prev) => ({ ...prev, forceTag: true }));
						setScreen('review');
					}}
					onRename={() => setScreen('version-bump')}
					onBack={() => setScreen('version-bump')}
					onQuit={quit}
				/>
			);

		case 'build-offer':
			return (
				<BuildOffer
					version={draft.version}
					tagName={tagName}
					onBuild={handleBuild}
					onSkip={handleSkipBuild}
					onHelp={showHelp}
					onQuit={quit}
				/>
			);

		case 'build-progress':
			return (
				<BuildProgressScreen
					phoneStatus={phoneStatus}
					wearStatus={wearStatus}
					logLines={buildLogLines}
				/>
			);

		case 'preflight-failure':
			return (
				<PreflightFailure
					checks={preflightChecks}
					onBack={() => setScreen('build-offer')}
					onQuit={quit}
				/>
			);

		case 'done':
			return (
				<Done
					version={draft.version}
					tagName={tagName}
					filesChanged={filesChanged}
					isRedo={draft.mode === 'redo'}
					artifacts={artifacts}
					onExit={quit}
				/>
			);

		case 'help':
			return <Help onClose={() => setScreen(prevScreen)} />;

		default:
			return null;
	}
}
