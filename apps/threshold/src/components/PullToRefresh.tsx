// Gesture-driven pull-to-refresh wrapper for the mobile alarm list
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import React, { useRef, useState, useCallback } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';

const PULL_THRESHOLD = 72;

interface PullToRefreshProps {
	onRefresh: () => void | Promise<void>;
	children: React.ReactNode;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const pullY = useMotionValue(0);
	const spinnerOpacity = useTransform(pullY, [0, PULL_THRESHOLD], [0, 1]);
	const spinnerScale = useTransform(pullY, [0, PULL_THRESHOLD], [0.5, 1]);

	const prefersReducedMotion =
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const startYRef = useRef<number | null>(null);

	// The router's `.wa-route-slot` is the app's single scroll container (see router.tsx) --
	// this component doesn't scroll itself, so the "are we at the top" guard has to read
	// that ancestor's scrollTop, not this Box's own.
	const getScrollParent = () =>
		containerRef.current?.closest<HTMLElement>('.wa-route-slot') ?? null;

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			const scrollParent = getScrollParent();
			if (!scrollParent || scrollParent.scrollTop > 0 || isRefreshing) return;
			startYRef.current = e.clientY;
			setIsDragging(true);
		},
		[isRefreshing],
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!isDragging || startYRef.current === null) return;
			const scrollParent = getScrollParent();
			if (!scrollParent || scrollParent.scrollTop > 0) {
				setIsDragging(false);
				pullY.set(0);
				startYRef.current = null;
				return;
			}
			const delta = Math.max(0, e.clientY - startYRef.current);
			// Dampen the pull for a natural feel
			const dampened = Math.min(delta * 0.5, PULL_THRESHOLD * 1.5);
			pullY.set(dampened);
		},
		[isDragging, pullY],
	);

	const handlePointerUp = useCallback(() => {
		if (!isDragging) return;
		setIsDragging(false);
		startYRef.current = null;

		const settle = () => {
			if (prefersReducedMotion) {
				pullY.set(0);
			} else {
				animate(pullY, 0, { type: 'spring', stiffness: 300, damping: 30 });
			}
		};

		const currentPull = pullY.get();
		if (currentPull >= PULL_THRESHOLD) {
			setIsRefreshing(true);
			// Keep the spinner up for the real duration of the refresh, and don't let a
			// rejected refresh vanish silently -- reflect actual completion, not a guess.
			Promise.resolve(onRefresh())
				.catch((e) => {
					console.error('[PullToRefresh] Refresh failed:', e);
				})
				.finally(() => {
					setIsRefreshing(false);
					settle();
				});
		} else {
			settle();
		}
	}, [isDragging, pullY, onRefresh, prefersReducedMotion]);

	return (
		<Box
			ref={containerRef}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			sx={{
				position: 'relative',
				// pan-y (not pan-x): this wraps a vertically-scrolling list, and must match
				// SwipeToDeleteRow's own touchAction so their intersection still allows native
				// vertical scrolling instead of cancelling it out entirely.
				touchAction: 'pan-y',
				overflowY: 'auto',
				flexGrow: 1,
			}}
		>
			{/* Pull indicator */}
			<motion.div
				style={{
					display: 'flex',
					justifyContent: 'center',
					alignItems: 'center',
					overflow: 'hidden',
					height: pullY,
					opacity: spinnerOpacity,
					scale: spinnerScale,
				}}
			>
				<CircularProgress
					size={28}
					color="primary"
					variant={isRefreshing ? 'indeterminate' : 'determinate'}
					value={isRefreshing ? undefined : 100}
				/>
			</motion.div>
			{children}
		</Box>
	);
};
