import React, { useEffect, useState } from 'react';
import { Button, Typography, Box } from '@mui/material';
import { useParams, useNavigate } from '@tanstack/react-router';
import { alarmManagerService } from '../services/AlarmManagerService';
import { Alarm } from '../services/DatabaseService';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import { listen } from '@tauri-apps/api/event';
import '../theme/ringing.css';
import { TimeFormatHelper } from '../utils/TimeFormatHelper';
import { ROUTES, SPECIAL_ALARM_IDS } from '../constants';

const Ringing: React.FC = () => {
	const { id } = useParams({ from: '/ringing/$id' });
	const [alarm, setAlarm] = useState<Alarm | null>(null);
	const [timeStr, setTimeStr] = useState<string>('');
	const navigate = useNavigate();

	// Listen for Alarm Updates (Singleton pattern)
	useEffect(() => {
		const unlistenUpdate = listen<{ id: number }>('alarm-update', (event) => {
			console.log('Ringing window received update:', event.payload);
			navigate({ to: '/ringing/$id', params: { id: event.payload.id.toString() } });
		});

		return () => {
			unlistenUpdate.then((fn) => fn());
		};
	}, [navigate]);

    // Theme handling is now automatic via ThemeContextProvider (parent of Router)
    // Ringing screen inherits styles from document.body variables injected by ThemeContext

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
	const handleDismiss = async () => {
		// Stop the ringing sound/vibration
		await alarmManagerService.stopRinging();

		// Test Alarm Logic
		if (parseInt(id) === SPECIAL_ALARM_IDS.TEST_ALARM) {
			// Return to previous screen (likely Settings)
			window.history.back();
			return;
		}

		// Check platform and close window if desktop
		const os = platform();
		if (os !== 'ios' && os !== 'android') {
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
	};

	const handleSnooze = () => {
		console.log('Snoozed Alarm', id);
		// Implement snooze logic properly later
		handleDismiss();
	};

	return (
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
                            Snooze (10m)
                        </Button>
                    </div>
                </div>
            </Box>
        </Box>
	);
};

export default Ringing;
