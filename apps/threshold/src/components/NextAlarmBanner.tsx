// Home screen banner showing the next upcoming alarm and its countdown
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { AccessTime as AccessTimeIcon } from '@mui/icons-material';
import { AlarmRecord } from '../types/alarm';
import { TimeFormatHelper } from '../utils/TimeFormatHelper';
import { UI } from '../theme/uiTokens';

// The countdown's finest unit is minutes, so a tick this often keeps it from
// visibly lagging without re-rendering far more than the display needs.
const COUNTDOWN_TICK_MS = 30_000;

interface NextAlarmBannerProps {
	alarms: AlarmRecord[];
	is24h: boolean;
}

export const NextAlarmBanner: React.FC<NextAlarmBannerProps> = ({ alarms, is24h }) => {
	const theme = useTheme();

	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const interval = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
		return () => clearInterval(interval);
	}, []);

	const nextAlarm = alarms
		.filter((a) => a.enabled && a.nextTrigger && a.nextTrigger > now)
		.sort((a, b) => a.nextTrigger! - b.nextTrigger!)[0];

	if (!nextAlarm) return null;

	const triggerDate = new Date(nextAlarm.nextTrigger!);
	const diffMs = nextAlarm.nextTrigger! - now;
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
	const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

	// Once the countdown spans multiple days, minute-level precision isn't useful --
	// show day+hour instead of a triple-digit hour count like "166h 45m".
	const countdownParts: string[] = [];
	if (diffDays > 0) {
		countdownParts.push(`${diffDays}d`);
		if (diffHours > 0) countdownParts.push(`${diffHours}h`);
	} else {
		if (diffHours > 0) countdownParts.push(`${diffHours}h`);
		countdownParts.push(`${diffMinutes}m`);
	}
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
				Next alarm in {countdown} · Scheduled: {formattedTime}
			</Typography>
		</Box>
	);
};
