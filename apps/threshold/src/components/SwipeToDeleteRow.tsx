// Wraps a row with a swipe-to-reveal delete action
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import React, { useRef, useState } from 'react';
import {
	motion,
	useMotionValue,
	useTransform,
	PanInfo,
	useAnimation,
	useDragControls,
	Transition,
	MotionProps,
} from 'motion/react';
import { Box, ButtonBase } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { usePrefersReducedMotion } from '../utils/usePrefersReducedMotion';

// Hoisted to module scope -- calling motion.create(Box) inside the component would create a
// new component type on every render, remounting the whole row (and losing its animation
// state) each time.
const MotionBox = motion.create(Box);

interface SwipeToDeleteRowProps {
	children: React.ReactNode;
	onDelete: () => void | Promise<void>;
	onClick?: () => void;
	deleteThreshold?: number; // 0-1, relative to width
	// Drives the layout ("FLIP") animation that slides the remaining rows into the gap once
	// this one is removed -- passed in by AlarmItem so both the mobile and desktop row wrappers
	// share the same reduced-motion/animator-duration-scale-aware transition.
	reflowTransition: Transition;
	// Fade/slide-in played once when a genuinely new row mounts (returning from Add/Edit) --
	// passed in by AlarmItem so both the mobile and desktop row wrappers share the same
	// reduced-motion-aware entrance animation.
	enterAnimation?: Pick<MotionProps, 'initial' | 'animate'>;
}

export const SwipeToDeleteRow: React.FC<SwipeToDeleteRowProps> = ({
	children,
	onDelete,
	onClick,
	deleteThreshold = 0.35,
	reflowTransition,
	enterAnimation,
}) => {
	const x = useMotionValue(0);
	const controls = useAnimation();
	const dragControls = useDragControls();
	const [isDeleting, setIsDeleting] = useState(false);
	const prefersReducedMotion = usePrefersReducedMotion();

	const containerRef = useRef<HTMLDivElement>(null);

	// Track drag to distinguish tap vs swipe
	const isDrag = useRef(false);

	// Framer's default drag-on-touch behaviour engages purely from x-axis movement, with no
	// awareness of the list's own vertical gestures (e.g. pull-to-refresh, which always starts
	// on the topmost row since that's the only place it can arm). dragListener={false} below
	// plus manually calling dragControls.start() here defers engaging Framer's drag entirely
	// until a small initial movement clearly favours the horizontal axis -- a vertical-dominant
	// gesture (a pull, or just scrolling) never reveals the delete background at all, instead
	// of revealing it and only refusing to actually *delete* once released.
	const AXIS_DECISION_THRESHOLD = 5;
	const gestureStartRef = useRef<{ x: number; y: number } | null>(null);
	const axisDecidedRef = useRef(false);
	const activePointerIdRef = useRef<number | null>(null);

	const handleRowPointerDown = (e: React.PointerEvent) => {
		if (activePointerIdRef.current !== null) return;
		activePointerIdRef.current = e.pointerId;
		gestureStartRef.current = { x: e.clientX, y: e.clientY };
		axisDecidedRef.current = false;
	};

	const handleRowPointerMove = (e: React.PointerEvent) => {
		if (e.pointerId !== activePointerIdRef.current || axisDecidedRef.current) return;
		const start = gestureStartRef.current;
		if (!start) return;
		const dx = e.clientX - start.x;
		const dy = e.clientY - start.y;
		if (Math.abs(dx) < AXIS_DECISION_THRESHOLD && Math.abs(dy) < AXIS_DECISION_THRESHOLD) return;

		axisDecidedRef.current = true;
		if (Math.abs(dx) > Math.abs(dy)) {
			dragControls.start(e);
		}
		// else: vertical-dominant -- never engage Framer's drag for this gesture at all.
	};

	const handleRowPointerEnd = (e: React.PointerEvent) => {
		if (e.pointerId !== activePointerIdRef.current) return;
		activePointerIdRef.current = null;
		gestureStartRef.current = null;
		axisDecidedRef.current = false;
	};

	const handleDragStart = () => {
		isDrag.current = false;
	};

	const handleDrag = (_: any, info: PanInfo) => {
		// Simple heuristic: if moved more than 5px, it's a drag
		if (Math.abs(info.offset.x) > 5 || Math.abs(info.offset.y) > 5) {
			isDrag.current = true;
		}
	};

	const handleDragEnd = async (_: any, info: PanInfo) => {
		const offset = info.offset.x;
		const velocity = info.velocity.x;
		const width = containerRef.current?.offsetWidth || 0;

		// Conditions to trigger delete:
		// 1. Dragged past threshold (>35% of width) in EITHER direction
		// 2. High velocity fling (>500) in EITHER direction
		const isPastThreshold = Math.abs(offset) > width * deleteThreshold;
		const isFastFling = Math.abs(velocity) > 500;
		// This row's own drag="x" tracks x-axis movement independent of whatever the list's
		// vertical gestures (e.g. pull-to-refresh, which starts on this exact row since it's
		// the topmost one) are doing with the same touch. A fast, mostly-vertical release can
		// still pick up incidental x offset/velocity from natural hand motion, so only commit
		// to a delete when the horizontal movement actually dominates the vertical -- otherwise
		// releasing a vertical pull gesture over this row can delete it by accident.
		const isHorizontalDominant =
			Math.abs(offset) > Math.abs(info.offset.y) && Math.abs(velocity) >= Math.abs(info.velocity.y);

		if (isHorizontalDominant && (isPastThreshold || isFastFling) && !isDeleting) {
			setIsDeleting(true);
			if (prefersReducedMotion) {
				onDelete();
			} else {
				// Animate off screen in the direction of the swipe
				const direction = offset > 0 ? 1 : -1;
				await controls.start({
					x: direction * width * 1.5,
					transition: { duration: 0.2 },
				});
				onDelete();
			}
		} else {
			// Spring back to start
			if (prefersReducedMotion) {
				await controls.start({ x: 0, transition: { duration: 0 } });
			} else {
				await controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 25 } });
			}
			// Reset drag flag so subsequent taps register as clicks
			isDrag.current = false;
		}
	};

	const handleTap = (event: MouseEvent | TouchEvent | PointerEvent) => {
		const target = event.target as HTMLElement;
		// Ignore taps on interactive elements *inside* the row
		const interactiveMatch = target.closest('button, input, [role="button"], .MuiSwitch-root');

		// If we found an interactive element, and it's NOT our row wrapper (which has class 'swipe-row-content'), ignore it.
		if (interactiveMatch && !interactiveMatch.classList.contains('swipe-row-content')) {
			return;
		}

		if (!isDrag.current && onClick) {
			onClick();
		}
	};

	// Right icon (revealed when swiping Left): Visible when x < 0
	const rightIconOpacity = useTransform(x, [0, -50], [0, 1]);
	const rightIconScale = useTransform(x, [0, -50], [0.5, 1]);

	// Left icon (revealed when swiping Right): Visible when x > 0
	const leftIconOpacity = useTransform(x, [0, 50], [0, 1]);
	const leftIconScale = useTransform(x, [0, 50], [0.5, 1]);

	return (
		<MotionBox
			ref={containerRef}
			layout
			transition={reflowTransition}
			{...enterAnimation}
			sx={{
				position: 'relative',
				overflow: 'hidden',
				borderRadius: '16px', // Matches the "bubble" look
				mb: 2, // Space between bubbles
				width: '100%',
				touchAction: 'pan-y',
				WebkitTapHighlightColor: 'transparent',
			}}
		>
			{/* Background Layer (Red Delete Action) */}
			<Box
				sx={{
					position: 'absolute',
					top: 0,
					bottom: 0,
					left: 0,
					right: 0,
					bgcolor: 'error.main',
					borderRadius: '16px',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between', // Space icons to edges
					px: 3, // Padding for icons on both sides
					color: 'error.contrastText',
				}}
			>
				{/* Left Icon (appears when dragging Right) */}
				<motion.div style={{ opacity: leftIconOpacity, scale: leftIconScale }}>
					<DeleteIcon />
				</motion.div>

				{/* Right Icon (appears when dragging Left) */}
				<motion.div style={{ opacity: rightIconOpacity, scale: rightIconScale }}>
					<DeleteIcon />
				</motion.div>
			</Box>

			{/* Foreground Layer (Swipeable Content) */}
			<motion.div
				drag="x"
				dragListener={false}
				dragControls={dragControls}
				dragConstraints={{ left: 0, right: 0 }}
				dragElastic={0.5}
				onPointerDown={handleRowPointerDown}
				onPointerMove={handleRowPointerMove}
				onPointerUp={handleRowPointerEnd}
				onPointerCancel={handleRowPointerEnd}
				onDragStart={handleDragStart}
				onDrag={handleDrag}
				onDragEnd={handleDragEnd}
				animate={controls}
				// touchAction must be set on this exact element (not just the outer wrapper) --
				// Motion needs it here to let the browser handle vertical scroll natively while
				// still capturing horizontal drag itself, or it captures all touch input.
				style={{ x, touchAction: 'pan-y' }}
				onTap={handleTap}
			>
				{/* 
                  Use ButtonBase for ripple effect. 
                  Identify it with 'swipe-row-content' for the tap handler.
                */}
				<ButtonBase
					className="swipe-row-content"
					component="div"
					sx={{
						width: '100%',
						bgcolor: 'background.paper',
						borderRadius: '16px',
						overflow: 'hidden', // Contain ripple
						display: 'block', // ButtonBase is inline-flex by default
						textAlign: 'left', // Reset text align
						transition: 'none', // Prevent interference
					}}
				>
					{children}
				</ButtonBase>
			</motion.div>
		</MotionBox>
	);
};
