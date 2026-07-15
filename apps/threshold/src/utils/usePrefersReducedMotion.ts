// Tracks the OS-level prefers-reduced-motion setting live, not just at mount
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function getInitial(): boolean {
	return typeof window !== 'undefined' && window.matchMedia(QUERY).matches;
}

export function usePrefersReducedMotion(): boolean {
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(getInitial);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const mql = window.matchMedia(QUERY);
		const handleChange = () => setPrefersReducedMotion(mql.matches);
		mql.addEventListener('change', handleChange);
		return () => mql.removeEventListener('change', handleChange);
	}, []);

	return prefersReducedMotion;
}
