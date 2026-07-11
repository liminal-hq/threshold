// Tests for the predictive-back view-transition-skip workaround
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { describe, it, expect } from 'vitest';
import { skipNextViewTransition } from './RouteStage';

describe('skipNextViewTransition', () => {
	it('sets shouldViewTransition to false on the router instance', () => {
		const router = {} as any;

		skipNextViewTransition(router);

		expect(router.shouldViewTransition).toBe(false);
	});
});
