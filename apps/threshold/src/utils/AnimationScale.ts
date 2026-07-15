// Reads Android's animator duration scale and applies it to the app's UI animations
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { getAnimatorDurationScale } from 'tauri-plugin-os-prefs-api';
import { PlatformUtils } from './PlatformUtils';

const BASE_SETTLE_MS = 220;
// Named generically (not e.g. --predictive-back-duration) since this is now the app's shared
// OS-animator-duration-scale-aware duration, referenced by predictiveBack.css's settle
// transitions and by other unrelated UI animations (e.g. the alarm list's reflow/entrance and
// accent-rail transitions) that want to stay in step with the same system setting.
const CSS_VARIABLE = '--wa-animation-duration';

let cachedScale = 1;

export const AnimationScale = {
	/**
	 * Fetches the OS's animator duration scale once and applies it to the shared CSS custom
	 * property predictiveBack.css and other UI transitions (e.g. the alarm list's reflow/entrance
	 * and accent-rail colour transitions) reference, so they all speed up/slow down along with a
	 * user's Developer Options setting instead of a fixed duration. No-ops on non-Android
	 * platforms, where the scale is always 1 (the default).
	 */
	async init(): Promise<void> {
		if (!PlatformUtils.isMobile()) {
			return;
		}

		try {
			const { scale } = await getAnimatorDurationScale();
			cachedScale = scale;
		} catch (e) {
			console.warn('[AnimationScale] Failed to read animator duration scale', e);
			return;
		}

		if (typeof document !== 'undefined') {
			document.documentElement.style.setProperty(CSS_VARIABLE, `${BASE_SETTLE_MS * cachedScale}ms`);
		}
	},

	/**
	 * The settle-animation duration in ms, scaled by the OS setting -- kept in sync with the
	 * same CSS variable this module sets on :root, for JS-side timers (e.g. RouteStage's
	 * settle-animation timeout) that can't just reference a CSS variable directly.
	 */
	getSettleDurationMs(): number {
		return BASE_SETTLE_MS * cachedScale;
	},
};
