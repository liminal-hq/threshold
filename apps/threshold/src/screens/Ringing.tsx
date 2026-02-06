import React, { useEffect, useState, useCallback } from 'react';
import { Button, Typography, Box } from '@mui/material';
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
import { SettingsService } from '../services/SettingsService';
import { appManagementService } from '../services/AppManagementService';
import ThresholdIndicator from './ThresholdIndicator';

const Ringing: React.FC = () => {
	const { id } = useParams({ from: '/ringing/$id' });
	const [alarm, setAlarm] = useState<Alarm | null>(null);
	const [timeStr, setTimeStr] = useState<string>('');
	const navigate = useNavigate();

	// Settings state
	const [snoozeLength] = useState<number>(SettingsService.getSnoozeLength());
	const [silenceAfter] = useState<number>(SettingsService.getSilenceAfter());

	// Listen for Alarm Updates (Singleton pattern)
	// Note: Theme changes are handled globally by App.tsx -> ThemeContextProvider
	useEffect(() => {
		const unlistenUpdate = listen<{ id: number }>('alarm-update', (event) => {
			console.log('Ringing window received update:', event.payload);
			navigate({ to: '/ringing/$id', params: { id: event.payload.id.toString() } });
		});

		return () => {
			unlistenUpdate.then((fn) => fn());
		};
	}, [navigate]);

	// Removed manual theme reconstruction. Inherits from Global Context.

	useEffect(() => {
		const loadAlarm = async () => {
			try {
				if (alarmManagerService.isInitialized()) {
					console.log('[Ringing] AlarmManager already initialized.');
				} else {
					console.log('[Ringing] Initializing AlarmManagerService...');
					await alarmManagerService.init();
				}

				const alarms = await alarmManagerService.loadAlarms();
				const found = alarms.find((a) => a.id === parseInt(id));

				if (found) {
					setAlarm((prev) => {
						if (!prev || prev.id !== found.id || prev.soundUri !== found.soundUri) {
							console.log('[Ringing] Alarm updated:', found.id, 'soundUri:', found.soundUri);
							return found;
						}
						return prev;
					});
				} else {
					console.error('[Ringing] Alarm not found for ID:', id);
				}
			} catch (e) {
				console.error('[Ringing] Failed to load alarm:', e);
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
	// Audio / Synth State
	const [audioError, setAudioError] = useState<string | null>(null);
	const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);

	const handleDismiss = useCallback(async () => {
		console.log('[Ringing] Dismissing Alarm', id);
		await alarmManagerService.stopRinging();

		// Check platform and close window if desktop
		if (PlatformUtils.isDesktop()) {
			try {
				await getCurrentWindow().close();
			} catch (e) {
				console.error('Failed to close window', e);
				navigate({ to: ROUTES.HOME, replace: true });
			}
			return;
		}

		// Test Alarm Logic
		if (parseInt(id) === SPECIAL_ALARM_IDS.TEST_ALARM) {
			window.history.back();
			return;
		}

		// On Mobile: Minimize the app so it vanishes but doesn't close
		try {
			await appManagementService.minimizeApp();
			// Small delay to ensure minimize completes before navigation
			await new Promise((resolve) => setTimeout(resolve, 100));
			// Navigate to home in background so next launch is clean
			navigate({ to: ROUTES.HOME, replace: true });
		} catch (e) {
			console.error('Failed to minimize window', e);
			navigate({ to: ROUTES.HOME, replace: true });
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
			const timer = setTimeout(
				() => {
					console.log(`Silence limit reached (${silenceAfter}m). Dismissing alarm.`);
					handleDismiss();
				},
				silenceAfter * 60 * 1000,
			);
			return () => clearTimeout(timer);
		} else {
			console.log('Silence timer disabled (Never or 0)');
		}
	}, [silenceAfter, handleDismiss]);

	// Audio playback logic for desktop
	useEffect(() => {
		if (PlatformUtils.isMobile() || !alarm) {
			return;
		}

		console.log('[Ringing] Audio Effect Triggered. soundUri:', alarm.soundUri);
		let audio: HTMLAudioElement | null = null;
		let synthInterval: any = null;
		let isCleanedUp = false;

		const startSynthFallback = (reason: string) => {
			if (isCleanedUp) return;
			console.log(`[Ringing] Starting Synth Fallback (Reason: ${reason})`);
			const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

			const playBeep = () => {
				if (isCleanedUp) return;
				if (audioCtx.state === 'suspended') audioCtx.resume();
				const osc = audioCtx.createOscillator();
				const gain = audioCtx.createGain();

				osc.type = 'square';
				osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5

				// Increased volume for synth fallback
				gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
				gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);

				osc.connect(gain);
				gain.connect(audioCtx.destination);

				osc.start();
				osc.stop(audioCtx.currentTime + 0.5);
			};

			playBeep();
			synthInterval = setInterval(playBeep, 1000);
		};

		const startAudio = async () => {
			if (!alarm.soundUri) {
				startSynthFallback('No soundUri');
				return;
			}

			try {
				let assetUrl = alarm.soundUri;

				// Better heuristic: if it looks like an absolute path and isn't a likely web-root relative path
				const isAbsolutePath = alarm.soundUri.startsWith('/') || alarm.soundUri.includes(':\\');
				const isWebRootPath =
					alarm.soundUri.startsWith('/alarms/') || alarm.soundUri.startsWith('/static/');

				// IF the file is actually inside our public folder, use the relative path instead of asset protocol
				// This is much safer and avoids "URL can't be shown" security errors
				if (isAbsolutePath && alarm.soundUri.includes('/public/alarms/')) {
					const fileName = alarm.soundUri.split('/public/alarms/').pop();
					assetUrl = `/alarms/${fileName}`;
					console.log(
						'[Ringing] Detected bundled asset from absolute path. Using relative URL:',
						assetUrl,
					);
				} else if (isAbsolutePath && !isWebRootPath) {
					// Truly external file
					assetUrl = convertFileSrc(alarm.soundUri);
					console.log('[Ringing] External file detected. Using asset protocol:', assetUrl);
				}

				console.log('[Ringing] Final Audio URL:', assetUrl);

				audio = new Audio(assetUrl);
				audio.loop = true;

				audio.addEventListener('error', (e: any) => {
					if (isCleanedUp) return;
					const error = audio?.error;
					console.error('[Ringing] Audio element error:', {
						code: error?.code,
						message: error?.message,
						event: e,
					});
					setAudioError(`Code ${error?.code}: ${error?.message || 'Load failed'}`);
					if (!synthInterval) startSynthFallback('Audio error event');
				});

				await audio
					.play()
					.then(() => {
						console.log('[Ringing] Audio playback started successfully');
						setIsAudioUnlocked(true);
					})
					.catch((e) => {
						if (isCleanedUp) return;

						// Ignore abort errors which usually mean the effect was cleaned up
						if (e.name === 'AbortError') {
							console.log('[Ringing] Audio playback aborted during load (cleanup)');
							return;
						}

						console.warn('[Ringing] Playback blocked or failed:', e.name, e.message);
						setAudioError(e.message);
						if (!synthInterval) startSynthFallback(`Playback fail: ${e.name}`);
					});
			} catch (e: any) {
				if (isCleanedUp) return;
				console.error('[Ringing] Audio initialization failed:', e);
				if (!synthInterval) startSynthFallback('Initialization exception');
			}
		};

		startAudio();

		return () => {
			isCleanedUp = true;
			if (audio) {
				console.log('[Ringing] Cleaning up audio');
				audio.pause();
				audio.src = '';
				audio = null;
			}
			if (synthInterval) {
				console.log('[Ringing] Cleaning up synth');
				clearInterval(synthInterval);
			}
		};
	}, [alarm]);

	// Global click listener to "unlock" audio if it was blocked
	useEffect(() => {
		const unlock = () => {
			if (!isAudioUnlocked) {
				console.log('[Ringing] User interacted. Audio should be unlocked now.');
				setIsAudioUnlocked(true);
			}
		};
		window.addEventListener('click', unlock);
		return () => window.removeEventListener('click', unlock);
	}, [isAudioUnlocked]);

	// Handle transparency for desktop
	useEffect(() => {
		if (PlatformUtils.isMobile()) return;

		// Save original background
		const originalBg = document.body.style.backgroundColor;

		// Set transparent background for the window
		document.body.style.backgroundColor = 'transparent';
		document.documentElement.style.backgroundColor = 'transparent';

		return () => {
			// Restore original background
			document.body.style.backgroundColor = originalBg;
			document.documentElement.style.backgroundColor = '';
		};
	}, []);

	return (
		// ThemeProvider is already provided by App.tsx -> ThemeContextProvider
		// We just use the global theme context which correctly handles System/Material You/Built-in logic
		<Box
			className={`ringing-page ${PlatformUtils.isDesktop() ? 'desktop-mode' : ''}`}
			onClick={() => setIsAudioUnlocked(true)}
		>
			<div className="ringing-container" data-tauri-drag-region="true">
				{/* Time Display with Breathing Rings */}
				<div className="time-display-container">
					<div className="breathing-ring ring-1"></div>
					<div className="breathing-ring ring-2"></div>
					<div className="breathing-ring ring-3"></div>

					<Typography variant="h1" className="ringing-time">
						{timeStr}
					</Typography>
				</div>

				<Typography variant="h4" className="ringing-label">
					{alarm?.label || 'Wake up!'}
				</Typography>

				{/* Threshold Indicator (Sleep -> Wake) */}
				<div className="threshold-indicator-container">
					<ThresholdIndicator />
				</div>

				<div className="ringing-actions">
					<Button
						variant="contained"
						fullWidth
						className="ringing-btn-stop"
						onClick={handleDismiss}
					>
						Stop Alarm
					</Button>

					<Button
						variant="outlined"
						fullWidth
						className="ringing-btn-snooze"
						onClick={handleSnooze}
					>
						Snooze ({snoozeLength}m)
					</Button>

					{audioError && !isAudioUnlocked && (
						<Button
							variant="text"
							fullWidth
							onClick={() => setIsAudioUnlocked(true)}
							sx={{ mt: 2, color: 'rgba(255,255,255,0.8)', textDecoration: 'underline' }}
						>
							Click to unlock sound
						</Button>
					)}
				</div>

				<Typography className="ringing-liminal-note">gentle transition</Typography>
			</div>
		</Box>
	);
};

export default Ringing;
