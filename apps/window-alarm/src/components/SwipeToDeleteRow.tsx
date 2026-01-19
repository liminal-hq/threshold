import React, { useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, useAnimation } from 'motion/react';
import { Box } from '@mui/material';
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
    const x = useMotionValue(0);
    const controls = useAnimation();
    const [isDeleting, setIsDeleting] = useState(false);

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
        // 1. Dragged past threshold (>35% of width) in EITHER direction
        // 2. High velocity fling (>500) in EITHER direction
        const isPastThreshold = Math.abs(offset) > (width * deleteThreshold);
        const isFastFling = Math.abs(velocity) > 500;

        if ((isPastThreshold || isFastFling) && !isDeleting) {
            setIsDeleting(true);
            // Animate off screen in the direction of the swipe
            const direction = offset > 0 ? 1 : -1;
            await controls.start({
                x: direction * width * 1.5,
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

    // Right icon (revealed when swiping Left): Visible when x < 0
    const rightIconOpacity = useTransform(x, [0, -50], [0, 1]);
    const rightIconScale = useTransform(x, [0, -50], [0.5, 1]);

    // Left icon (revealed when swiping Right): Visible when x > 0
    const leftIconOpacity = useTransform(x, [0, 50], [0, 1]);
    const leftIconScale = useTransform(x, [0, 50], [0.5, 1]);

    return (
        <Box
            ref={containerRef}
            sx={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '16px', // Matches the "bubble" look
                mb: 2, // Space between bubbles
                width: '100%',
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
                    justifyContent: 'space-between', // Space icons to edges
                    px: 3, // Padding for icons on both sides
                    color: 'error.contrastText'
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
                // Allow drag in both directions. 
                // Setting constraints to 0 with `dragElastic` creates the resistance effect.
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.5} // Symmetric resistance
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
