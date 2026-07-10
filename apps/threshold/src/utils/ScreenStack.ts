// Caches the last 2 rendered screens (current + one back) for the predictive-back underlay
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { ReactNode } from 'react';

interface ScreenEntry {
	path: string;
	node: ReactNode;
}

/**
 * A tiny, path-keyed cache mirroring the app's actual navigation stack, so the underlay is
 * always exactly what a back gesture would reveal -- not just "whatever was 2 screens ago".
 *
 * `RouteStage` calls `setCurrent` on every navigation with the actual element for the new
 * current route; `getPrevious` is only ever read for the entry one level back (a
 * predictive-back gesture only ever peeks one level, matching `RouteTransitions`, which is
 * also single-level-only) -- but the full history has to be kept, not just the last 2 slots:
 * navigating Home -> Edit -> Settings -> back-to-Edit must reveal Home again on a further back
 * gesture, and Home would already be gone if entries were evicted while 2 levels deep at
 * Settings. The array only ever holds cheap React element descriptors, not mounted component
 * instances, so keeping the whole stack costs nothing extra.
 */
export class ScreenStack {
	private entries: ScreenEntry[] = [];

	public setCurrent(path: string, node: ReactNode) {
		const topIndex = this.entries.length - 1;

		if (topIndex >= 0 && this.entries[topIndex].path === path) {
			// Same route re-rendering (e.g. fresh data) -- refresh in place, don't grow the stack.
			this.entries[topIndex] = { path, node };
			return;
		}

		const previousIndex = topIndex - 1;
		if (previousIndex >= 0 && this.entries[previousIndex].path === path) {
			// Navigated back to the entry just below the top -- promote it and drop
			// whatever was above it.
			this.entries[previousIndex] = { path, node };
			this.entries.length = previousIndex + 1;
			return;
		}

		// A genuinely new route -- push it onto the stack.
		this.entries.push({ path, node });
	}

	public getPrevious(): ScreenEntry | null {
		const previousIndex = this.entries.length - 2;
		return previousIndex >= 0 ? this.entries[previousIndex] : null;
	}
}

export const screenStack = new ScreenStack();
