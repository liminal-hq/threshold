import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Button, Typography, Box, ThemeProvider } from '@mui/material';
import { useParams, useNavigate } from '@tanstack/react-router';
import { alarmManagerService } from '../services/AlarmManagerService';
import { Alarm } from '../services/DatabaseService';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { convertFileSrc } from '@tauri-apps/api/core';
import { PlatformUtils } from '../utils/PlatformUtils';
import { listen } from '@tauri-apps/api/event';
import '../theme/ringing.css';
import { TimeFormatHelper } from '../utils/TimeFormatHelper';
import { ROUTES, SPECIAL_ALARM_IDS } from '../constants';
import { SettingsService, Theme } from '../services/SettingsService';
import { createTheme } from '@mui/material/styles';
import { themes, generateSystemTheme } from '../theme/themes';

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
		const unlistenUpdate = listen<{ id: number }>('alarm-update', (event) => {
			console.log('Ringing window received update:', event.payload);
			navigate({ to: '/ringing/$id', params: { id: event.payload.id.toString() } });
		});

		return () => {
			unlistenUpdate.then((fn) => fn());
		};
	}, [navigate]);

	useEffect(() => {
		const unlisten = listen<{ theme: Theme; forceDark: boolean }>('theme-changed', (event) => {
			console.log('[Ringing] Theme changed event received:', event.payload);
			setTheme(event.payload.theme);
			setForceDark(event.payload.forceDark);
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	const muiTheme = useMemo(() => {
		// Determine if dark mode based on theme and forceDark
		const isDarkMode = theme === 'boring-dark' || (forceDark && theme !== 'boring-light');
		
		// Get theme definition
		let themeDef;
		if (theme === 'system') {
			themeDef = generateSystemTheme(isDarkMode);
		} else {
			const themeGroup = themes[theme] || themes['deep-night'];
			themeDef = isDarkMode ? (themeGroup as any).dark : (themeGroup as any).light;
		}
		
		return createTheme({
			palette: {
				mode: isDarkMode ? 'dark' : 'light',
				...themeDef.muiPalette,
			},
		});
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

	/**
	 * Handles alarm dismissal with platform-specific behaviour.
	 * 
	 * - Test Alarm (ID 999): Navigates back to previous screen
	 * - Mobile (iOS/Android): Minimizes app to background, preserving state
	 * - Desktop: Closes the ringing window
	 * 
	 * @remarks
	 * On mobile, we minimize instead of navigate to provide better UX:
	 * the app disappears immediately without showing the home screen transition.
	 * A small delay after minimize ensures the operation completes before navigation.
	 */
	const handleDismiss = useCallback(async () => {
		// Stop the ringing sound/vibration
		await alarmManagerService.stopRinging();

		// Test Alarm Logic
		if (parseInt(id) === SPECIAL_ALARM_IDS.TEST_ALARM) {
			// Return to previous screen (likely Settings)
			window.history.back();
			return;
		}

		// Check platform and close window if desktop
		if (PlatformUtils.isDesktop()) {
			try {
				await getCurrentWindow().close();
			} catch (e) {
				console.error('Failed to close window', e);
				navigate({ to: ROUTES.HOME, replace: true });
			}
		} else {
			// On Mobile: Minimize the app so it vanishes but doesn't close
			try {
				await getCurrentWindow().minimize();
				// Small delay to ensure minimize completes before navigation
				await new Promise(resolve => setTimeout(resolve, 100));
				// Navigate to home in background so next launch is clean
				navigate({ to: ROUTES.HOME, replace: true });
			} catch (e) {
				console.error('Failed to minimize window', e);
				navigate({ to: ROUTES.HOME, replace: true });
			}
		}
	}, [navigate, id]);

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

	// Audio playback logic for desktop
	useEffect(() => {
		if (PlatformUtils.isMobile() || !alarm || !alarm.soundUri) {
			return;
		}

		console.log('[Ringing] Attempting to play sound:', alarm.soundUri);
		let audio: HTMLAudioElement | null = null;

		try {
			const assetUrl = convertFileSrc(alarm.soundUri);
			audio = new Audio(assetUrl);
			audio.loop = true;
			audio.play().catch(e => {
				console.error('[Ringing] Failed to play audio:', e);
			});
		} catch (e) {
			console.error('[Ringing] Error initializing audio:', e);
		}

		return () => {
			if (audio) {
				audio.pause();
				audio.src = '';
				audio = null;
			}
		};
	}, [alarm]);

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
