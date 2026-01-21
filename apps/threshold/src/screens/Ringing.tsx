import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Button, Typography, Box, ThemeProvider } from '@mui/material';
import { useParams, useNavigate } from '@tanstack/react-router';
import { alarmManagerService } from '../services/AlarmManagerService';
import { Alarm } from '../services/DatabaseService';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import { SettingsService, Theme } from '../services/SettingsService';
import { getMuiTheme } from '../theme/MuiTheme';
import '../theme/ringing.css';
import { TimeFormatHelper } from '../utils/TimeFormatHelper';
import { listen } from '@tauri-apps/api/event';

const Ringing: React.FC = () => {
	const { id } = useParams({ from: '/ringing/$id' });
	const [alarm, setAlarm] = useState<Alarm | null>(null);
	const [timeStr, setTimeStr] = useState<string>('');
	const navigate = useNavigate();

	// Settings state
	const [snoozeLength] = useState<number>(SettingsService.getSnoozeLength());
	const [silenceAfter] = useState<number>(SettingsService.getSilenceAfter());

	// Theme state
	const [theme, setTheme] = useState<Theme>(SettingsService.getTheme());
	const [forceDark, setForceDark] = useState<boolean>(SettingsService.getForceDark());

	// Listen for theme changes and Alarm Updates (Singleton pattern)
	useEffect(() => {
		const unlistenTheme = listen<{ theme: Theme; forceDark: boolean }>('theme-changed', (event) => {
			console.log('Ringing window received theme-changed event:', event.payload);
			setTheme(event.payload.theme);
			setForceDark(event.payload.forceDark);
		});

		const unlistenUpdate = listen<{ id: number }>('alarm-update', (event) => {
			console.log('Ringing window received update:', event.payload);
			navigate({ to: '/ringing/$id', params: { id: event.payload.id.toString() } });
		});

		return () => {
			unlistenTheme.then((fn) => fn());
			unlistenUpdate.then((fn) => fn());
		};
	}, [navigate]);

	// Apply theme whenever it changes
	useEffect(() => {
		const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		let isDark = systemPrefersDark;

		if (theme === 'boring-light') isDark = false;
		else if (theme === 'boring-dark') isDark = true;
		else if (forceDark) isDark = true;

		console.log('Ringing window applying theme:', { theme, forceDark, isDark });

		// Apply theme class to body
		document.body.className = `theme-${theme}${forceDark ? ' force-dark' : ''}`;

		if (isDark) {
			document.body.classList.add('dark-mode');
		} else {
			document.body.classList.remove('dark-mode');
		}
	}, [theme, forceDark]);

	// Generate MUI theme based on current theme state
	const muiTheme = useMemo(() => {
		const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		let isDark = systemPrefersDark;

		if (theme === 'boring-light') isDark = false;
		else if (theme === 'boring-dark') isDark = true;
		else if (forceDark) isDark = true;

		console.log('Ringing window MUI theme:', { theme, mode: isDark ? 'dark' : 'light' });

		return getMuiTheme(theme, isDark ? 'dark' : 'light');
	}, [theme, forceDark]);

	useEffect(() => {
		const loadAlarm = async () => {
			const alarms = await alarmManagerService.loadAlarms();
			const found = alarms.find((a) => a.id === parseInt(id));
			if (found) {
				setAlarm(found);
			}
		};
		loadAlarm();

		// Update clock every second
		const updateTime = () => {
			const now = new Date();
			setTimeStr(TimeFormatHelper.format(now.getTime(), true)); // Force 24h for now, or fetch settings
		};
		updateTime();
		const interval = setInterval(updateTime, 1000);
		return () => clearInterval(interval);
	}, [id]);

	const handleDismiss = useCallback(async () => {
		// Stop the ringing sound/vibration
		await alarmManagerService.stopRinging();

		// Check platform and close window if desktop
		const os = platform();
		if (os !== 'ios' && os !== 'android') {
			try {
				await getCurrentWindow().close();
			} catch (e) {
				console.error('Failed to close window', e);
				navigate({ to: '/home', replace: true });
			}
		} else {
			navigate({ to: '/home', replace: true });
		}
	}, [navigate]);

	const handleSnooze = async () => {
		const alarmId = parseInt(id);
		console.log('Snoozing Alarm', alarmId, 'for', snoozeLength, 'minutes');
		await alarmManagerService.snoozeAlarm(alarmId, snoozeLength);
		handleDismiss();
	};

	// Silence After Timer
	useEffect(() => {
		if (silenceAfter > 0) {
			console.log(`Setting silence timer for ${silenceAfter} minutes`);
			const timer = setTimeout(() => {
				console.log(`Silence limit reached (${silenceAfter}m). Dismissing alarm.`);
				handleDismiss();
			}, silenceAfter * 60 * 1000);
			return () => clearTimeout(timer);
		} else {
			console.log('Silence timer disabled (Never or 0)');
		}
	}, [silenceAfter, handleDismiss]);

	return (
		<ThemeProvider theme={muiTheme}>
			<Box className="ringing-page" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
				<Box sx={{ flexGrow: 1 }}>
					<div className="ringing-container" data-tauri-drag-region="true">
						<Typography variant="h1" className="ringing-time" sx={{ fontSize: '5rem', fontWeight: 800 }}>{timeStr}</Typography>
						<Typography variant="h4" className="ringing-label" sx={{ mb: 6 }}>{alarm?.label}</Typography>

						<div className="ringing-actions">
							<Button
								variant="contained"
								fullWidth
								size="large"
								sx={{
									bgcolor: 'secondary.contrastText', // Matches the clock text colour (White in Light, Dark in Dark)
									color: 'secondary.main', // Matches the page background colour
									borderRadius: '50px',
									fontWeight: 'bold',
									height: '56px',
									'&:hover': {
										bgcolor: 'secondary.contrastText',
										filter: 'brightness(0.9)'
									},
									textTransform: 'none',
									fontSize: '1.2rem',
									boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
								}}
								onClick={handleDismiss}
							>
								Stop Alarm
							</Button>
							<Button
								variant="outlined"
								fullWidth
								size="large"
								sx={{
									color: 'inherit', // Inherit from theme instead of hardcoded white
									borderColor: 'currentColor',
									borderRadius: '50px',
									fontWeight: '600',
									mt: 1,
									'&:hover': { borderColor: 'currentColor', bgcolor: 'rgba(255,255,255,0.1)' },
									textTransform: 'none'
								}}
								onClick={handleSnooze}
							>
								Snooze ({snoozeLength}m)
							</Button>
						</div>
					</div>
				</Box>
			</Box>
		</ThemeProvider>
	);
};

export default Ringing;
