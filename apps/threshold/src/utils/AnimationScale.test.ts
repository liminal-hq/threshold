// Tests for the animator-duration-scale reader
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./PlatformUtils', () => ({
	PlatformUtils: {
		isMobile: vi.fn(),
	},
}));

vi.mock('tauri-plugin-os-prefs-api', () => ({
	getAnimatorDurationScale: vi.fn(),
}));

describe('AnimationScale', () => {
	beforeEach(() => {
		vi.resetModules();
		document.documentElement.style.removeProperty('--predictive-back-duration');
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('does nothing on non-mobile platforms, leaving the default 220ms', async () => {
		const { PlatformUtils } = await import('./PlatformUtils');
		vi.mocked(PlatformUtils.isMobile).mockReturnValue(false);
		const { AnimationScale } = await import('./AnimationScale');

		await AnimationScale.init();

		expect(AnimationScale.getSettleDurationMs()).toBe(220);
		expect(document.documentElement.style.getPropertyValue('--predictive-back-duration')).toBe('');
	});

	it('scales the settle duration and sets the CSS variable on Android', async () => {
		const { PlatformUtils } = await import('./PlatformUtils');
		const { getAnimatorDurationScale } = await import('tauri-plugin-os-prefs-api');
		vi.mocked(PlatformUtils.isMobile).mockReturnValue(true);
		vi.mocked(getAnimatorDurationScale).mockResolvedValue({ scale: 2 });
		const { AnimationScale } = await import('./AnimationScale');

		await AnimationScale.init();

		expect(AnimationScale.getSettleDurationMs()).toBe(440);
		expect(document.documentElement.style.getPropertyValue('--predictive-back-duration')).toBe(
			'440ms',
		);
	});

	it('falls back to the default duration if the native call fails', async () => {
		const { PlatformUtils } = await import('./PlatformUtils');
		const { getAnimatorDurationScale } = await import('tauri-plugin-os-prefs-api');
		vi.mocked(PlatformUtils.isMobile).mockReturnValue(true);
		vi.mocked(getAnimatorDurationScale).mockRejectedValue(new Error('not available'));
		const { AnimationScale } = await import('./AnimationScale');

		await AnimationScale.init();

		expect(AnimationScale.getSettleDurationMs()).toBe(220);
	});
});
