// Tests for the predictive-back underlay screen cache
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, it, expect, beforeEach } from 'vitest';
import { ScreenStack } from './ScreenStack';

describe('ScreenStack', () => {
	let screenStack: ScreenStack;

	beforeEach(() => {
		screenStack = new ScreenStack();
	});

	it('has no previous entry before any navigation', () => {
		expect(screenStack.getPrevious()).toBeNull();
	});

	it('has no previous entry after a single screen is set', () => {
		screenStack.setCurrent('/home', 'home-node');
		expect(screenStack.getPrevious()).toBeNull();
	});

	it('exposes the prior screen as previous after navigating forward', () => {
		screenStack.setCurrent('/home', 'home-node');
		screenStack.setCurrent('/edit/1', 'edit-node');

		expect(screenStack.getPrevious()).toEqual({ path: '/home', node: 'home-node' });
	});

	it('always exposes only the immediate one-back entry, regardless of stack depth', () => {
		screenStack.setCurrent('/home', 'home-node');
		screenStack.setCurrent('/edit/1', 'edit-node');
		screenStack.setCurrent('/settings', 'settings-node');

		// A gesture at /settings only ever peeks one level back, to /edit/1 -- not all the
		// way to /home.
		expect(screenStack.getPrevious()).toEqual({ path: '/edit/1', node: 'edit-node' });
	});

	it('refreshes the top entry in place on a same-route re-render, without growing the stack', () => {
		screenStack.setCurrent('/home', 'home-node');
		screenStack.setCurrent('/edit/1', 'edit-node-v1');
		screenStack.setCurrent('/edit/1', 'edit-node-v2');

		expect(screenStack.getPrevious()).toEqual({ path: '/home', node: 'home-node' });
	});

	it('promotes the previous entry back to top on backward navigation, dropping what was above it', () => {
		screenStack.setCurrent('/home', 'home-node');
		screenStack.setCurrent('/edit/1', 'edit-node');
		screenStack.setCurrent('/settings', 'settings-node');

		// Navigate back to /edit/1 -- /settings is dropped, /edit/1 becomes current again.
		screenStack.setCurrent('/edit/1', 'edit-node-refreshed');

		expect(screenStack.getPrevious()).toEqual({ path: '/home', node: 'home-node' });
	});

	it('collapses back to an earlier entry even when it is not the immediate previous slot, preventing unbounded growth', () => {
		screenStack.setCurrent('/home', 'home-node');
		screenStack.setCurrent('/settings', 'settings-node');
		screenStack.setCurrent('/ringing/999', 'ringing-node');
		// Dismissing navigates forward to /home (replace: true), not back() -- /home is not the
		// entry directly below the top (/settings is), so this only collapses correctly if the
		// whole stack, not just the adjacent slot, is searched for a match.
		screenStack.setCurrent('/home', 'home-node-refreshed');

		expect(screenStack.getPrevious()).toBeNull();

		// Repeating the cycle must not grow the stack -- if it did, /settings would show up as
		// the one-back entry again after revisiting it.
		screenStack.setCurrent('/settings', 'settings-node-2');
		screenStack.setCurrent('/ringing/999', 'ringing-node-2');
		screenStack.setCurrent('/home', 'home-node-2');

		expect(screenStack.getPrevious()).toBeNull();
	});
});
