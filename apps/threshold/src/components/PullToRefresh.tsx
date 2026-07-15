// Gesture-driven pull-to-refresh wrapper for the mobile alarm list
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import React, { useRef, useState, useEffect } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';
import { usePrefersReducedMotion } from '../utils/usePrefersReducedMotion';

const PULL_THRESHOLD = 72;
// Minimum vertical movement before committing this gesture as a pull (rather than an ordinary
// scroll) -- without this, a drag that starts scrolling normally and merely jitters downward by
// a pixel or two would suddenly get hijacked into the pull gesture mid-scroll.
const PULL_ARM_THRESHOLD = 10;
const RING_SIZE = 28;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type GestureState = 'idle' | 'tracking' | 'committed';

interface PullToRefreshProps {
	onRefresh: () => void | Promise<void>;
	children: React.ReactNode;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const pullY = useMotionValue(0);
	const spinnerOpacity = useTransform(pullY, [0, PULL_THRESHOLD], [0, 1]);
	const spinnerScale = useTransform(pullY, [0, PULL_THRESHOLD], [0.5, 1]);
	// Ring fill tracks the live pull distance via a Framer transform (no React re-renders on
	// every drag tick) -- empty at the top of the pull, fully drawn once past the threshold.
	const ringDashoffset = useTransform(pullY, [0, PULL_THRESHOLD], [RING_CIRCUMFERENCE, 0], {
		clamp: true,
	});

	const prefersReducedMotion = usePrefersReducedMotion();

	// Plain refs, not state: these only drive the imperative gesture logic inside the native
	// listeners below and never need to trigger a re-render on their own. One state value per
	// gesture (rather than separate dragging/committed booleans) so there's no combination of
	// the two that doesn't correspond to a real, named phase of the gesture.
	const gestureRef = useRef<GestureState>('idle');
	const pointerIdRef = useRef<number | null>(null);
	const startYRef = useRef<number | null>(null);
	const refreshingRef = useRef(false);
	const onRefreshRef = useRef(onRefresh);
	onRefreshRef.current = onRefresh;
	const prefersReducedMotionRef = useRef(prefersReducedMotion);
	prefersReducedMotionRef.current = prefersReducedMotion;

	// `.wa-route-top` (RouteStage.tsx / predictiveBack.css) is the screen's real scroll
	// viewport in practice -- it sits between `.wa-route-slot` and the routed content and
	// carries its own overflow-y: auto (needed so tall screens aren't clipped by
	// `.wa-route-stage`'s overflow: hidden), so it's the ancestor that actually scrolls, not
	// `.wa-route-slot` itself. This Box deliberately has no overflow of its own (see the sx
	// below) so it can never become a second, competing scroll container -- it only needs to
	// grow tall enough to cover empty list space for touch-target purposes, not to scroll.
	const getScrollParent = () => containerRef.current?.closest<HTMLElement>('.wa-route-top') ?? null;

	// React's synthetic pointer/touch handlers are attached as passive listeners, so calling
	// preventDefault() inside them can't stop native scrolling: with touch-action: pan-y in play,
	// Chromium can start scrolling on the compositor thread without waiting for JS at all. The
	// only way to reliably claim a vertical drag back from native scroll is a genuinely
	// non-passive listener attached via addEventListener -- that forces the browser to wait for
	// this handler to run (and lets its preventDefault() actually cancel the scroll) before
	// committing. Pointer Events (not Touch Events) are used here so mouse and pen input --
	// common on modern tablets/2-in-1 Android devices, not just touch -- get the same gesture.
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const settle = () => {
			if (prefersReducedMotionRef.current) {
				pullY.set(0);
			} else {
				animate(pullY, 0, { type: 'spring', stiffness: 300, damping: 30 });
			}
		};

		const abandon = () => {
			gestureRef.current = 'idle';
			pointerIdRef.current = null;
			startYRef.current = null;
			pullY.set(0);
		};

		const handlePointerDown = (e: PointerEvent) => {
			if (refreshingRef.current || gestureRef.current !== 'idle') return;
			// Ignore secondary mouse/pen buttons (right-click, barrel button) -- only a primary
			// press/touch should ever start the gesture.
			if (e.button !== 0) return;
			const scrollParent = getScrollParent();
			if (!scrollParent || scrollParent.scrollTop > 0) return;
			pointerIdRef.current = e.pointerId;
			startYRef.current = e.clientY;
			gestureRef.current = 'tracking';
		};

		const handlePointerMove = (e: PointerEvent) => {
			if (e.pointerId !== pointerIdRef.current) return;
			if (gestureRef.current === 'idle' || startYRef.current === null) return;
			const rawDelta = e.clientY - startYRef.current;

			if (gestureRef.current === 'committed') {
				if (rawDelta <= 0) {
					// Back at (or above) the start point -- no longer pulling; hand control back
					// to native scroll instead of continuing to preventDefault every move.
					abandon();
					return;
				}
				e.preventDefault();
				const dampened = Math.min(rawDelta * 0.5, PULL_THRESHOLD * 1.5);
				pullY.set(dampened);
				return;
			}

			// Still deciding whether this is a pull or an ordinary scroll -- re-check the live
			// scroll position (rather than trusting it stays 0, which can lag a frame or two
			// behind native scrolling that's already begun) and only claim the gesture once
			// movement is unambiguously a deliberate downward pull.
			const scrollParent = getScrollParent();
			if (!scrollParent || scrollParent.scrollTop > 0) {
				abandon();
				return;
			}
			if (rawDelta <= -PULL_ARM_THRESHOLD) {
				// Clearly scrolling normally -- stop watching this gesture entirely so native
				// scroll has uncontested control for the rest of it.
				abandon();
				return;
			}
			if (rawDelta < PULL_ARM_THRESHOLD) return;

			gestureRef.current = 'committed';
			e.preventDefault();
			const dampened = Math.min(rawDelta * 0.5, PULL_THRESHOLD * 1.5);
			pullY.set(dampened);
		};

		const handlePointerEnd = (e: PointerEvent) => {
			if (e.pointerId !== pointerIdRef.current) return;
			const wasCommitted = gestureRef.current === 'committed';
			gestureRef.current = 'idle';
			pointerIdRef.current = null;
			startYRef.current = null;

			if (!wasCommitted) {
				pullY.set(0);
				return;
			}

			const currentPull = pullY.get();
			if (currentPull >= PULL_THRESHOLD) {
				refreshingRef.current = true;
				setIsRefreshing(true);
				// Keep the spinner up for the real duration of the refresh, and don't let a
				// rejected refresh vanish silently -- reflect actual completion, not a guess.
				Promise.resolve(onRefreshRef.current())
					.catch((e) => {
						console.error('[PullToRefresh] Refresh failed:', e);
					})
					.finally(() => {
						refreshingRef.current = false;
						setIsRefreshing(false);
						settle();
					});
			} else {
				settle();
			}
		};

		el.addEventListener('pointerdown', handlePointerDown, { passive: true });
		el.addEventListener('pointermove', handlePointerMove, { passive: false });
		el.addEventListener('pointerup', handlePointerEnd, { passive: true });
		el.addEventListener('pointercancel', handlePointerEnd, { passive: true });

		return () => {
			el.removeEventListener('pointerdown', handlePointerDown);
			el.removeEventListener('pointermove', handlePointerMove);
			el.removeEventListener('pointerup', handlePointerEnd);
			el.removeEventListener('pointercancel', handlePointerEnd);
		};
	}, [pullY]);

	return (
		<Box
			ref={containerRef}
			sx={{
				position: 'relative',
				// pan-y (not pan-x): this wraps a vertically-scrolling list, and must match
				// SwipeToDeleteRow's own touchAction so their intersection still allows native
				// vertical scrolling instead of cancelling it out entirely.
				touchAction: 'pan-y',
				// No overflow set here deliberately -- this Box must never become its own scroll
				// container (see getScrollParent's comment above); flexGrow alone is enough to
				// let it fill empty list space for touch-target purposes, while actual scrolling
				// still belongs solely to `.wa-route-top`.
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
				{isRefreshing ? (
					<CircularProgress size={RING_SIZE} color="primary" aria-label="Refreshing" />
				) : (
					<Box
						component="svg"
						width={RING_SIZE}
						height={RING_SIZE}
						role="progressbar"
						aria-label="Pull to refresh"
						aria-valuemin={0}
						aria-valuemax={100}
						sx={{ color: 'primary.main', transform: 'rotate(-90deg)' }}
					>
						<circle
							cx={RING_SIZE / 2}
							cy={RING_SIZE / 2}
							r={RING_RADIUS}
							fill="none"
							stroke="currentColor"
							strokeOpacity={0.2}
							strokeWidth={RING_STROKE}
						/>
						<motion.circle
							cx={RING_SIZE / 2}
							cy={RING_SIZE / 2}
							r={RING_RADIUS}
							fill="none"
							stroke="currentColor"
							strokeWidth={RING_STROKE}
							strokeLinecap="round"
							strokeDasharray={RING_CIRCUMFERENCE}
							style={{ strokeDashoffset: ringDashoffset }}
						/>
					</Box>
				)}
			</motion.div>
			{children}
		</Box>
	);
};
