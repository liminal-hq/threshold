import React, { useRef, useState, useCallback } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { motion, useMotionValue, useTransform, animate } from 'motion/react';

const PULL_THRESHOLD = 72;

interface PullToRefreshProps {
	onRefresh: () => void;
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
		typeof window !== 'undefined' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const startYRef = useRef<number | null>(null);

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		const el = containerRef.current;
		if (!el || el.scrollTop > 0 || isRefreshing) return;
		startYRef.current = e.clientY;
		setIsDragging(true);
	}, [isRefreshing]);

	const handlePointerMove = useCallback((e: React.PointerEvent) => {
		if (!isDragging || startYRef.current === null) return;
		const el = containerRef.current;
		if (!el || el.scrollTop > 0) {
			setIsDragging(false);
			pullY.set(0);
			startYRef.current = null;
			return;
		}
		const delta = Math.max(0, e.clientY - startYRef.current);
		// Dampen the pull for a natural feel
		const dampened = Math.min(delta * 0.5, PULL_THRESHOLD * 1.5);
		pullY.set(dampened);
	}, [isDragging, pullY]);

	const handlePointerUp = useCallback(() => {
		if (!isDragging) return;
		setIsDragging(false);
		startYRef.current = null;

		const currentPull = pullY.get();
		if (currentPull >= PULL_THRESHOLD) {
			setIsRefreshing(true);
			onRefresh();
			// Reset after a short delay to show the spinner
			setTimeout(() => {
				setIsRefreshing(false);
				if (prefersReducedMotion) {
					pullY.set(0);
				} else {
					animate(pullY, 0, { type: 'spring', stiffness: 300, damping: 30 });
				}
			}, 600);
		} else {
			if (prefersReducedMotion) {
				pullY.set(0);
			} else {
				animate(pullY, 0, { type: 'spring', stiffness: 300, damping: 30 });
			}
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
				touchAction: 'pan-x',
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
