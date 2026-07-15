// Shared sx builders for the alarm card and its accent rail
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { SxProps, Theme } from '@mui/material/styles';
import { UI } from './uiTokens';

// Returns sx for the card container — enabled/disabled drives accent rail colour.
export function alarmCardSx(_enabled: boolean, isMobile: boolean): SxProps<Theme> {
	return {
		position: 'relative',
		overflow: 'hidden',
		borderRadius: isMobile ? UI.card.borderRadius : undefined,
		boxShadow: isMobile ? 'none' : undefined,
		bgcolor: 'background.paper',
		cursor: 'pointer',
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		p: 2,
		mb: isMobile ? 0 : undefined,
		borderBottom: isMobile ? 'none' : undefined,
	};
}

// Returns sx for the left accent rail Box.
export function accentRailSx(enabled: boolean): SxProps<Theme> {
	return {
		position: 'absolute',
		left: 0,
		top: 0,
		bottom: 0,
		width: UI.card.accentRailWidth,
		bgcolor: enabled ? 'primary.main' : 'action.disabled',
		pointerEvents: 'none',
		// --wa-animation-duration is set once at startup by AnimationScale.ts from Android's
		// Developer Options animator duration scale -- reused here (rather than a hardcoded
		// duration) so this transition speeds up/slows down along with every other animation
		// the OS setting already governs, instead of drifting out of sync with its own fixed
		// value.
		transition: 'background-color var(--wa-animation-duration, 220ms) ease',
		'@media (prefers-reduced-motion: reduce)': {
			transition: 'none',
		},
	};
}
