import React from 'react';
import { Box, Typography } from '@mui/material';

const ThresholdIndicator: React.FC = () => {
	return (
		<Box
			sx={{
				position: 'relative',
				width: 140,
				height: 40,
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
			}}
			role="img"
			aria-label="Threshold Indicator: Transitioning from sleep to wake"
		>
			{/* SVG Graphic Layer */}
			<svg width="100%" height="100%" viewBox="-75 -24 150 48" style={{ overflow: 'visible' }}>
				{/* Timeline */}
				<line
					x1="-70"
					y1="0"
					x2="70"
					y2="0"
					stroke="currentColor"
					strokeWidth="1.5"
					opacity="0.3"
				/>

				{/* Sleep state point */}
				<circle cx="-70" cy="0" r="4" fill="currentColor" opacity="0.4" />

				{/* Wake state point */}
				<circle cx="70" cy="0" r="4" fill="currentColor" opacity="0.3" />

				{/* Current position (threshold) - Animated */}
				<g>
					{/* Core Dot - variable color support via primary theme var */}
					<circle cx="0" cy="0" r="5" fill="var(--app-colour-primary)" opacity="0.9">
						<animate
							attributeName="opacity"
							values="0.9;0.5;0.9"
							dur="2s"
							repeatCount="indefinite"
						/>
					</circle>

					{/* Ripple Ring */}
					<circle
						cx="0"
						cy="0"
						r="8"
						fill="none"
						stroke="var(--app-colour-primary)"
						strokeWidth="1.5"
						opacity="0.4"
					>
						<animate attributeName="r" values="8;12;8" dur="2s" repeatCount="indefinite" />
						<animate
							attributeName="opacity"
							values="0.4;0.1;0.4"
							dur="2s"
							repeatCount="indefinite"
						/>
					</circle>
				</g>
			</svg>

			{/* HTML Text Overlay Layer for Localization */}
			{/* Sleep Label */}
			<Typography
				sx={{
					position: 'absolute',
					top: -12,
					left: 0,
					transform: 'translate(-50%, -50%)', // Center on top-left point
					fontFamily: 'inherit',
					fontSize: '0.7rem',
					fontWeight: 300,
					color: 'inherit',
					opacity: 0.5,
					letterSpacing: '0.5px',
				}}
			>
				sleep
			</Typography>

			{/* Wake Label */}
			<Typography
				sx={{
					position: 'absolute',
					top: -12,
					right: 0,
					transform: 'translate(50%, -50%)', // Center on top-right point
					fontFamily: 'inherit',
					fontSize: '0.7rem',
					fontWeight: 300,
					color: 'inherit',
					opacity: 0.5,
					letterSpacing: '0.5px',
				}}
			>
				wake
			</Typography>

			{/* Main Center Label */}
			<Typography
				sx={{
					position: 'absolute',
					bottom: -10,
					left: '50%',
					transform: 'translateX(-50%)',
					fontFamily: 'inherit',
					fontSize: '0.75rem',
					fontWeight: 300,
					color: 'inherit',
					opacity: 0.6,
					letterSpacing: '1.5px',
					whiteSpace: 'nowrap',
				}}
			>
				crossing threshold
			</Typography>
		</Box>
	);
};

export default ThresholdIndicator;
