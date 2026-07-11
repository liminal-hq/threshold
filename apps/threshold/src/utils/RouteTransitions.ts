// Page transition animation definitions for routing
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { PlatformUtils } from './PlatformUtils';

type TransitionDirection = 'forwards' | 'backwards' | 'none';

export class RouteTransitions {
	private stack: string[] = [];
	private nextDirectionOverride: TransitionDirection | null = null;

	constructor() {
		// Initialize with current path if available
		if (typeof window !== 'undefined') {
			this.stack.push(window.location.pathname);
		}
	}

	/**
	 * Checks if View Transitions should be enabled.
	 * Only on Android and if the API exists.
	 */
	public shouldAnimate(): boolean {
		// PlatformUtils.getPlatform() returns 'android', 'ios', 'windows', 'macos', 'linux'
		const isAndroid = PlatformUtils.getPlatform() === 'android';
		const hasApi = 'startViewTransition' in document;
		return isAndroid && hasApi;
	}

	/**
	 * Call this before a navigation to determine the direction.
	 * Updates the internal stack.
	 */
	public getDirection(toPath: string): TransitionDirection {
		if (!this.shouldAnimate()) {
			return 'none';
		}

		let direction: TransitionDirection;

		// Check for override (e.g. hardware back button)
		if (this.nextDirectionOverride) {
			direction = this.nextDirectionOverride;
			this.nextDirectionOverride = null;
		} else {
			const currentPath = this.stack[this.stack.length - 1];
			const previousPath = this.stack[this.stack.length - 2];

			if (currentPath === toPath) {
				direction = 'none';
			} else if (previousPath === toPath) {
				direction = 'backwards';
			} else {
				direction = 'forwards';
			}
		}

		this.updateStack(toPath, direction);

		return direction;
	}

	/**
	 * Manually set the next transition direction.
	 * Useful for hardware back buttons.
	 */
	public setNextDirection(direction: TransitionDirection) {
		this.nextDirectionOverride = direction;
	}

	private updateStack(toPath: string, direction: TransitionDirection) {
		if (direction === 'backwards') {
			this.stack.pop();
		} else if (direction === 'forwards') {
			this.stack.push(toPath);
		}
		// 'none' doesn't change stack
	}
}

export const routeTransitions = new RouteTransitions();
