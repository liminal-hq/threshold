import React from 'react';
import { Box, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { AccessTime as AccessTimeIcon } from '@mui/icons-material';
import { AlarmRecord } from '../types/alarm';
import { TimeFormatHelper } from '../utils/TimeFormatHelper';
import { UI } from '../theme/uiTokens';

interface NextAlarmBannerProps {
	alarms: AlarmRecord[];
	is24h: boolean;
}

export const NextAlarmBanner: React.FC<NextAlarmBannerProps> = ({ alarms, is24h }) => {
	const theme = useTheme();

	const now = Date.now();
	const nextAlarm = alarms
		.filter((a) => a.enabled && a.nextTrigger && a.nextTrigger > now)
		.sort((a, b) => a.nextTrigger! - b.nextTrigger!)
		[0];

	if (!nextAlarm) return null;

	const triggerDate = new Date(nextAlarm.nextTrigger!);
	const diffMs = nextAlarm.nextTrigger! - now;
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
	const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

	const countdownParts: string[] = [];
	if (diffHours > 0) countdownParts.push(`${diffHours}h`);
	countdownParts.push(`${diffMinutes}m`);
	const countdown = countdownParts.join(' ');

	const formattedTime = TimeFormatHelper.format(triggerDate, is24h);

	const ariaLabel = `Next alarm in ${countdown}, at ${formattedTime}`;

	return (
		<Box
			role="status"
			aria-label={ariaLabel}
			sx={{
				background: `linear-gradient(to right, ${alpha(theme.palette.primary.main, 0.16)}, ${alpha(theme.palette.primary.main, 0.03)})`,
				borderRadius: UI.banner.borderRadius,
				px: 2,
				py: 1.5,
				mb: 2,
				display: 'flex',
				alignItems: 'center',
				gap: 1.5,
			}}
		>
			<AccessTimeIcon sx={{ color: 'primary.main', fontSize: 20 }} />
			<Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
				Next alarm in {countdown}  ·  Scheduled: {formattedTime}
			</Typography>
		</Box>
	);
};
