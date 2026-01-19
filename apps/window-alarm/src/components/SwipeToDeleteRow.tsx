import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, useAnimation } from 'motion/react';
import { Box, IconButton, useTheme } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

interface SwipeToDeleteRowProps {
    children: React.ReactNode;
    onDelete: () => void | Promise<void>;
    onClick?: () => void;
    deleteThreshold?: number; // 0-1, relative to width
}

export const SwipeToDeleteRow: React.FC<SwipeToDeleteRowProps> = ({
    children,
    onDelete,
    onClick,
    deleteThreshold = 0.35
}) => {
    const theme = useTheme();
    const x = useMotionValue(0);
    const controls = useAnimation();
    const [isDeleting, setIsDeleting] = useState(false);

    // Constraints: can drag left (negative x), but not right (positive x)
    // We add a little resistance on the right by using constraints
    const dragConstraints = useRef(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Track drag to distinguish tap vs swipe
    const isDrag = useRef(false);

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
        // 1. Dragged past threshold (>35% of width)
        // 2. High velocity fling to the left
        const isPastThreshold = offset < -(width * deleteThreshold);
        const isFastFling = velocity < -500;

        if ((isPastThreshold || isFastFling) && !isDeleting) {
            setIsDeleting(true);
            // Animate off screen to the left
            await controls.start({
                x: -width * 1.5,
                transition: { duration: 0.2 }
            });
            // Trigger delete callback
            onDelete();
        } else {
            // Spring back to start
            controls.start({ x: 0, transition: { type: 'spring', stiffness: 400, damping: 25 } });
        }
    };

    const handleTap = () => {
        if (!isDrag.current && onClick) {
            onClick();
        }
    };

    // Transform opacity of delete icon based on drag distance
    // Fully visible when swiped 50px
    const iconOpacity = useTransform(x, [0, -50], [0, 1]);
    const iconScale = useTransform(x, [0, -50], [0.5, 1]);

    return (
        <Box
            ref={containerRef}
            sx={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '16px', // Matches the "bubble" look
                mb: 2, // Space between bubbles
                width: '100%',
                // Prevent vertical scroll lock while swiping horizontally implies touch-action logic
                // But motion handles much of this. Pan-y allows vertical scroll.
                touchAction: 'pan-y'
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
                    justifyContent: 'flex-end',
                    pr: 3,
                    color: 'error.contrastText'
                }}
            >
                <motion.div style={{ opacity: iconOpacity, scale: iconScale }}>
                    <DeleteIcon />
                </motion.div>
            </Box>

            {/* Foreground Layer (Swipeable Content) */}
            <motion.div
                ref={dragConstraints}
                drag="x"
                dragConstraints={{ left: -1000, right: 0 }}
                dragElastic={{ right: 0.1, left: 0.5 }} // Bouncy on left, rigid on right
                onDragStart={handleDragStart}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                animate={controls}
                style={{ x }}
                onTap={handleTap}
            >
                {/* 
                  Wrapper box to ensure the foreground has a solid background 
                  so the red layer is hidden behind it until swiped 
                */}
                <Box sx={{ position: 'relative', bgcolor: 'background.paper', borderRadius: '16px' }}>
                    {children}
                </Box>
            </motion.div>
        </Box>
    );
};
