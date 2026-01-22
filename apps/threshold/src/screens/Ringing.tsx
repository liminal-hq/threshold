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

	const handleDismiss = async () => {
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
