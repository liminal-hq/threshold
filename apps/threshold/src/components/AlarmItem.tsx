import React from 'react';
import { Card, Typography, Switch, IconButton, Box, Stack } from '@mui/material';
import { Delete as DeleteIcon, Shuffle as ShuffleIcon, AccessTime as AccessTimeIcon } from '@mui/icons-material';
import { Alarm } from '../services/DatabaseService';
import { format } from 'date-fns';
import { TimeFormatHelper } from '../utils/TimeFormatHelper';
import { PlatformUtils } from '../utils/PlatformUtils';
import { SwipeToDeleteRow } from './SwipeToDeleteRow';

interface AlarmItemProps {
	alarm: Alarm;
	is24h: boolean;
	onToggle: (enabled: boolean) => void;
	onDelete: () => void;
	onClick: () => void;
}

export const AlarmItem: React.FC<AlarmItemProps> = ({
	alarm,
	is24h,
	onToggle,
	onDelete,
	onClick,
}) => {
	const isMobile = PlatformUtils.isMobile();
	const formatTime = (timeStr?: string) => {
		if (!timeStr) return '--:--';
		return TimeFormatHelper.formatTimeString(timeStr, is24h);
	};

	const timeDisplay =
		alarm.mode === 'FIXED'
			? formatTime(alarm.fixedTime)
			: `${formatTime(alarm.windowStart)} - ${formatTime(alarm.windowEnd)}`;

	const nextTriggerDetailed =
		alarm.enabled && alarm.nextTrigger
			? `${format(new Date(alarm.nextTrigger), 'EEE')} ${TimeFormatHelper.format(alarm.nextTrigger, is24h)}`
			: 'Disabled';

	// Prevent Switch toggle from triggering swipe or click
	const handleSwitchClick = (e: React.MouseEvent) => {
		e.stopPropagation();
	};

	const InnerContent = (
		<Card
			// On Desktop, verify click here. On Mobile, SwipeToDeleteRow handles tap.
			onClick={!isMobile ? onClick : undefined}
			sx={{
				width: '100%',
				// Mobile "bubble" styling is handled by the wrapper now
				mb: isMobile ? 0 : undefined,
				display: 'flex',
				justifyContent: 'space-between',
				alignItems: 'center',
				p: 2,
				cursor: 'pointer',
				borderRadius: isMobile ? '16px' : undefined, // Bubble look on mobile, default on desktop
				// Ionic items are usually list items.
				// Let's keep card look but maybe reduced elevation or spacing on mobile
				boxShadow: isMobile ? 'none' : undefined, // Remove shadow inside the swipe row
				bgcolor: 'background.paper',
				borderBottom: isMobile ? 'none' : undefined, // Remove list separator look
			}}
		>
			<Box sx={{ display: 'flex', flexDirection: 'column' }}>
				<Typography variant="h5" component="div" sx={{ fontWeight: 'bold' }}>
					{timeDisplay}
				</Typography>
				<Typography variant="body2" color="text.secondary">
					{alarm.label || 'Alarm'}
				</Typography>
				<Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
					{alarm.enabled && (
						alarm.mode === 'WINDOW' ? <ShuffleIcon fontSize="inherit" color="action" /> : <AccessTimeIcon fontSize="inherit" color="action" />
					)}
					<Typography variant="caption" color="text.secondary">
						{nextTriggerDetailed}
					</Typography>
				</Stack>
			</Box>
			<Box onClick={handleSwitchClick} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} sx={{ display: 'flex', alignItems: 'center' }}>
				{!isMobile && (
					<IconButton onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="delete" size="large" sx={{ mr: 1 }}>
						<DeleteIcon />
					</IconButton>
				)}
				<Switch
					checked={alarm.enabled}
					onChange={(e) => onToggle(e.target.checked)}
					inputProps={{ 'aria-label': 'controlled' }}
				/>
			</Box>
		</Card>
	);

	if (isMobile) {
		return (
			<SwipeToDeleteRow onDelete={onDelete} onClick={onClick}>
				{InnerContent}
			</SwipeToDeleteRow>
		);
	}

	return (
		<Box sx={{ mb: 2 }}>
			{InnerContent}
		</Box>
	);
};
