// Git operations for the release TUI
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { spawnSync } from 'node:child_process';
import { TAG_RE, RELEASE_VERSION_FILES } from './constants.js';

function git(...args: string[]) {
	return spawnSync('git', args, { encoding: 'utf8' });
}

export function tagExistsLocally(tagName: string): boolean {
	const result = git('tag', '--list', tagName);
	return result.status === 0 && result.stdout.trim() === tagName;
}

export function tagExistsOnOrigin(tagName: string): boolean {
	const result = git('ls-remote', '--tags', 'origin', `refs/tags/${tagName}`);
	return result.status === 0 && result.stdout.trim() !== '';
}

export function findLocalTagDate(tagName: string): string | null {
	const result = git('for-each-ref', `refs/tags/${tagName}`, '--format=%(creatordate:short)');
	if (result.status !== 0) return null;
	const value = result.stdout.trim();
	return value || null;
}

export function findLocalTagCommit(tagName: string): string | null {
	const result = git('rev-parse', '--short', `refs/tags/${tagName}`);
	if (result.status !== 0) return null;
	return result.stdout.trim() || null;
}

export interface ReleaseTag {
	name: string;
	createdAt: string;
}

export function listLocalReleaseTags(limit = 20): ReleaseTag[] {
	const result = git(
		'for-each-ref',
		'refs/tags',
		'--sort=-creatordate',
		`--count=${limit}`,
		'--format=%(refname:short)|%(creatordate:short)',
	);
	if (result.status !== 0) return [];
	return result.stdout
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => {
			const [name, createdAt] = l.split('|');
			return { name, createdAt: createdAt ?? 'unknown' };
		})
		.filter((t) => TAG_RE.test(t.name));
}

export interface WorktreeChange {
	xy: string;
	path: string;
}

export function getWorktreeChanges(): WorktreeChange[] {
	const result = git('status', '--porcelain=v1', '--untracked-files=all');
	if (result.status !== 0) throw new Error(`git status failed: ${result.stderr.trim()}`);
	return result.stdout
		.split('\n')
		.map((l) => l.trimEnd())
		.filter(Boolean)
		.map((l) => {
			const xy = l.slice(0, 2);
			const rawPath = l.slice(3);
			const parts = rawPath.split(' -> ');
			return { xy, path: parts[parts.length - 1] };
		});
}

export function findUnrelatedChanges(changes: WorktreeChange[]): WorktreeChange[] {
	return changes.filter((c) => !RELEASE_VERSION_FILES.has(c.path));
}

export function createReleaseCommit(message: string, changedFiles: string[]): void {
	if (changedFiles.length === 0) throw new Error('No files to commit');
	const addResult = git('add', '--', ...changedFiles);
	if (addResult.status !== 0) throw new Error(`Failed to stage: ${addResult.stderr.trim()}`);
	const commitResult = git('commit', '-m', message, '--', ...changedFiles);
	if (commitResult.status !== 0) throw new Error(`Failed to commit: ${commitResult.stderr.trim()}`);
}

export function createRedoCommit(message: string): void {
	const result = git('commit', '--allow-empty', '-m', message);
	if (result.status !== 0) throw new Error(`Failed to commit: ${result.stderr.trim()}`);
}

export function applyTag(tagName: string, force = false): void {
	const args = force ? ['tag', '-f', tagName] : ['tag', tagName];
	const result = git(...args);
	if (result.status !== 0) throw new Error(`Failed to tag ${tagName}: ${result.stderr.trim()}`);
}
