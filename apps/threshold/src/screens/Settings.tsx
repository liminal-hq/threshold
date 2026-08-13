// Renders settings controls for appearance, alarm behaviour, diagnostics, and test utilities
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import React, { useState, useEffect } from 'react';
import {
	IconButton,
	List,
	ListItem,
	ListItemText,
	ListItemButton,
	Switch,
	FormControl,
	InputLabel,
	Select,
	MenuItem,
	Box,
	Container,
	ListSubheader,
	Paper,
	Typography,
	Dialog,
	DialogTitle,
	DialogContent,
	CircularProgress,
	Alert,
	Button,
} from '@mui/material';
import { MobileToolbar } from '../components/MobileToolbar';
import { ArrowBack as ArrowBackIcon, FileDownload as FileDownloadIcon } from '@mui/icons-material';
import { useNavigate } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
import { PlatformUtils } from '../utils/PlatformUtils';
import { SettingsService, Theme } from '../services/SettingsService';
import { AlarmService } from '../services/AlarmService';
import { useThemeContext } from '../contexts/ThemeContext';
import { eventLogService } from '../services/EventLogService';

type SettingsSection = 'appearance' | 'alarmSettings' | 'general' | 'developer';

const NAV_ITEMS: { key: SettingsSection; label: string }[] = [
	{ key: 'appearance', label: 'Appearance' },
	{ key: 'alarmSettings', label: 'Alarm Settings' },
	{ key: 'general', label: 'General' },
	{ key: 'developer', label: 'Developer' },
];

// The Android permissions/OS states that can silently degrade alarm reliability with no error
// surfaced anywhere -- see issue #281 (full-screen intent) and #282's Developer settings
// diagnostic. Ownership follows the plugin that already declares/drives each one: the first
// three are alarm-manager's (it already owns the ringing pipeline and declares their manifest
// permissions), while notifications is a generic OS concern that lives in os-prefs instead.
type PermissionKey = 'fullScreenIntent' | 'exactAlarm' | 'batteryOptimization' | 'notifications';

const PERMISSION_INFO: Record<PermissionKey, { label: string; description: string }> = {
	fullScreenIntent: {
		label: 'Full-screen intent',
		description: 'Lets the ringing screen take over the lock screen instead of just a banner',
	},
	exactAlarm: {
		label: 'Exact alarm scheduling',
		description: 'Alarms fire on time instead of drifting into an inexact window',
	},
	batteryOptimization: {
		label: 'Battery optimization exemption',
		description: 'Keeps Doze/App Standby from throttling the ringing pipeline',
	},
	notifications: {
		label: 'Notifications',
		description: 'Required for the ringing and upcoming-alarm notifications to post at all',
	},
};

const Settings: React.FC = () => {
	const navigate = useNavigate();
	const { theme, setTheme, forceDark, setForceDark, useMaterialYou, setUseMaterialYou } =
		useThemeContext();
	const [is24h, setIs24h] = useState<boolean>(SettingsService.getIs24h());
	const [isMobile, setIsMobile] = useState(false);
	const [isAndroid, setIsAndroid] = useState(false);
	const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');

	// New Settings State
	const [silenceAfter, setSilenceAfter] = useState<number>(SettingsService.getSilenceAfter());
	const [snoozeLength, setSnoozeLength] = useState<number>(SettingsService.getSnoozeLength());
	const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
	const [isExportingLogs, setIsExportingLogs] = useState(false);
	const [permissionStatus, setPermissionStatus] = useState<Record<PermissionKey, boolean | null>>({
		fullScreenIntent: null,
		exactAlarm: null,
		batteryOptimization: null,
		notifications: null,
	});
	// Developer toggle for wear-sync's native fired->watch-ring fan-out (issue #255 Phase
	// 3B). Named and stored in the switch's own sense (disabled, not enabled) so the JSX
	// below binds `checked` and `onChange` straight through with no inversion -- the
	// negation lives only at the two points that cross the API boundary, where the
	// underlying command is phrased as "enabled" instead.
	const [disableNativeFanOut, setDisableNativeFanOut] = useState<boolean>(false);

	useEffect(() => {
		setIsMobile(PlatformUtils.isMobile());
		setIsAndroid(PlatformUtils.getPlatform() === 'android');
	}, []);

	useEffect(() => {
		if (!isAndroid) return;

		(async () => {
			try {
				const { getNativeFanOutEnabled } = await import('tauri-plugin-wear-sync-api');
				const { enabled } = await getNativeFanOutEnabled();
				setDisableNativeFanOut(!enabled);
			} catch (e) {
				console.error('Failed to read native watch fan-out toggle:', e);
			}
		})();
	}, [isAndroid]);

	const handleDisableNativeFanOutChange = async (disabled: boolean) => {
		setDisableNativeFanOut(disabled);
		try {
			const { setNativeFanOutEnabled } = await import('tauri-plugin-wear-sync-api');
			await setNativeFanOutEnabled(!disabled);
		} catch (e) {
			console.error('Failed to set native watch fan-out toggle:', e);
		}
	};

	// Re-checked on every window focus regain (not just on mount) so both the Alarm Settings
	// banner and the Developer settings diagnostic clear themselves after the user flips a
	// toggle in system Settings and switches back, without needing to leave and re-enter this
	// screen.
	useEffect(() => {
		if (PlatformUtils.getPlatform() !== 'android') return;

		let unlisten: (() => void) | undefined;

		const checkPermissions = async () => {
			try {
				const alarmManager = await import('tauri-plugin-alarm-manager-api');
				const [fullScreenIntent, exactAlarm, batteryOptimization] = await Promise.all([
					alarmManager.checkFullScreenIntentPermission(),
					alarmManager.checkExactAlarmPermission(),
					alarmManager.checkBatteryOptimizationExemption(),
				]);
				setPermissionStatus((prev) => ({
					...prev,
					fullScreenIntent,
					exactAlarm,
					batteryOptimization,
				}));
			} catch (e) {
				console.error('Failed to check alarm-manager permissions:', e);
			}

			try {
				const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
				const notifications = await isPermissionGranted();
				setPermissionStatus((prev) => ({ ...prev, notifications }));
			} catch (e) {
				console.error('Failed to check notification permission:', e);
			}
		};

		checkPermissions();
		import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
			getCurrentWindow()
				.onFocusChanged(({ payload: focused }) => {
					if (focused) checkPermissions();
				})
				.then((fn) => {
					unlisten = fn;
				});
		});

		return () => unlisten?.();
	}, []);

	const openPermissionSettings = async (key: PermissionKey) => {
		try {
			switch (key) {
				case 'fullScreenIntent': {
					const { openFullScreenIntentSettings } = await import('tauri-plugin-alarm-manager-api');
					await openFullScreenIntentSettings();
					break;
				}
				case 'exactAlarm': {
					const { openExactAlarmSettings } = await import('tauri-plugin-alarm-manager-api');
					await openExactAlarmSettings();
					break;
				}
				case 'batteryOptimization': {
					const { openBatteryOptimizationSettings } =
						await import('tauri-plugin-alarm-manager-api');
					await openBatteryOptimizationSettings();
					break;
				}
				case 'notifications': {
					const { openNotificationSettings } = await import('tauri-plugin-os-prefs-api');
					await openNotificationSettings();
					break;
				}
			}
		} catch (e) {
			console.error(`Failed to open settings for ${key}:`, e);
		}
	};

	const handleTimeFormatChange = (enabled: boolean) => {
		setIs24h(enabled);
		SettingsService.setIs24h(enabled);
	};

	const handleExportLogs = async () => {
		if (isExportingLogs) return;
		setIsExportingLogs(true);
		try {
			await eventLogService.downloadEventLogs();
		} finally {
			setIsExportingLogs(false);
		}
	};

	// --- Shared section content renderers ---

	const renderAppearance = (px: number) => (
		<List
			subheader={
				isMobile ? (
					<ListSubheader sx={{ bgcolor: 'transparent' }}>Appearance</ListSubheader>
				) : undefined
			}
		>
			<ListItem sx={{ px }}>
				<FormControl fullWidth>
					<InputLabel id="theme-select-label">Theme</InputLabel>
					<Select
						labelId="theme-select-label"
						value={theme}
						label="Theme"
						onChange={(e) => setTheme(e.target.value as Theme)}
					>
						<MenuItem value="system">System (Auto)</MenuItem>
						<MenuItem value="deep-night">Deep Night (Default)</MenuItem>
						<MenuItem value="canadian-cottage-winter">Canadian Cottage Winter</MenuItem>
						<MenuItem value="georgian-bay-plunge">Georgian Bay Plunge</MenuItem>
						<MenuItem value="boring-light">Boring Light</MenuItem>
						<MenuItem value="boring-dark">Boring Dark</MenuItem>
					</Select>
				</FormControl>
			</ListItem>

			{/* Material You Toggle: visible on mobile only when system theme + Android; always visible on desktop */}
			{isMobile ? (
				theme === 'system' &&
				isAndroid && (
					<ListItem sx={{ px }}>
						<ListItemText primary="Use Material You" secondary="Use dynamic system colours" />
						<Switch
							edge="end"
							checked={useMaterialYou}
							onChange={(e) => setUseMaterialYou(e.target.checked)}
						/>
					</ListItem>
				)
			) : (
				<ListItem sx={{ px }}>
					<ListItemText
						primary="Use Material You"
						secondary={isAndroid ? 'Use dynamic system colours' : 'Android only'}
					/>
					<Switch
						edge="end"
						checked={useMaterialYou}
						onChange={(e) => setUseMaterialYou(e.target.checked)}
						disabled={!isAndroid}
					/>
				</ListItem>
			)}

			<ListItem sx={{ px }}>
				<ListItemText primary="Force Dark Mode" secondary="Override system colour scheme" />
				<Switch edge="end" checked={forceDark} onChange={(e) => setForceDark(e.target.checked)} />
			</ListItem>
		</List>
	);

	const renderAlarmSettings = (px: number) => (
		<List
			subheader={
				isMobile ? (
					<ListSubheader sx={{ bgcolor: 'transparent', mt: 2 }}>Alarm Settings</ListSubheader>
				) : undefined
			}
		>
			{isAndroid && permissionStatus.fullScreenIntent === false && (
				<ListItem sx={{ px }}>
					<Alert
						severity="warning"
						sx={{ width: '100%' }}
						action={
							<Button
								color="inherit"
								size="small"
								onClick={() => openPermissionSettings('fullScreenIntent')}
							>
								Enable
							</Button>
						}
					>
						The ringing screen won't appear over the lock screen until "Full screen intent
						notifications" is enabled for Threshold.
					</Alert>
				</ListItem>
			)}

			<ListItem sx={{ px }}>
				<FormControl fullWidth>
					<InputLabel id="silence-after-label">Silence After</InputLabel>
					<Select
						labelId="silence-after-label"
						value={silenceAfter}
						label="Silence After"
						onChange={(e) => {
							const val = Number(e.target.value);
							SettingsService.setSilenceAfter(val);
							setSilenceAfter(val);
						}}
					>
						<MenuItem value={1}>1 minute</MenuItem>
						<MenuItem value={5}>5 minutes</MenuItem>
						<MenuItem value={10}>10 minutes</MenuItem>
						<MenuItem value={15}>15 minutes</MenuItem>
						<MenuItem value={20}>20 minutes</MenuItem>
						<MenuItem value={-1}>Never</MenuItem>
					</Select>
				</FormControl>
			</ListItem>

			<ListItemButton onClick={() => setSnoozeDialogOpen(true)} sx={{ px }}>
				<ListItemText
					primary="Snooze Length"
					secondary={`${snoozeLength} minute${snoozeLength > 1 ? 's' : ''}`}
				/>
			</ListItemButton>
		</List>
	);

	const renderGeneral = (px: number) => (
		<List
			subheader={
				isMobile ? (
					<ListSubheader sx={{ bgcolor: 'transparent', mt: 2 }}>General</ListSubheader>
				) : undefined
			}
		>
			<ListItem sx={{ px }}>
				<ListItemText primary="24-Hour Time" secondary="Use 24-hour format for time display" />
				<Switch
					edge="end"
					checked={is24h}
					onChange={(e) => handleTimeFormatChange(e.target.checked)}
				/>
			</ListItem>
		</List>
	);

	const renderDeveloper = (px: number) => (
		<List
			subheader={
				isMobile ? (
					<ListSubheader sx={{ bgcolor: 'transparent', mt: 2 }}>Developer</ListSubheader>
				) : undefined
			}
		>
			{isAndroid && (
				<>
					<ListSubheader sx={{ bgcolor: 'transparent' }}>Permissions</ListSubheader>
					{(Object.keys(PERMISSION_INFO) as PermissionKey[]).map((key) => {
						const granted = permissionStatus[key];
						const info = PERMISSION_INFO[key];
						return (
							<ListItem key={key} sx={{ px }}>
								<ListItemText
									primary={info.label}
									secondary={`${
										granted === null ? 'Checking…' : granted ? 'Granted' : 'Not granted'
									} — ${info.description}`}
								/>
								{granted === false && (
									<Button size="small" onClick={() => openPermissionSettings(key)}>
										Fix
									</Button>
								)}
							</ListItem>
						);
					})}
				</>
			)}

			<ListSubheader sx={{ bgcolor: 'transparent', mt: 2 }}>Testing</ListSubheader>

			<ListItem sx={{ px }}>
				<ListItemText
					primary="Test Alarm Ring"
					secondary="Trigger a sample alarm to test the ringing window"
				/>
				<IconButton
					edge="end"
					onClick={async () => {
						if (isMobile) {
							// Mobile doesn't support multiple windows, navigate in-app
							navigate({ to: '/ringing/$id', params: { id: '999' } });
							return;
						}

						try {
							// Dynamically import to avoid issues on mobile
							const { WebviewWindow, getAllWebviewWindows } =
								await import('@tauri-apps/api/webviewWindow');

							// Cleanup previous test windows
							const allWindows = await getAllWebviewWindows();
							const existingTestWindows = allWindows.filter((w: any) =>
								w.label.startsWith('test-alarm-'),
							);
							for (const w of existingTestWindows) {
								try {
									await w.close();
								} catch (e) {
									console.warn('Failed to close previous test window', e);
								}
							}

							const timestamp = Date.now();
							const label = `test-alarm-${timestamp}`;

							console.log('Creating test alarm window with URL: /ringing/999');

							const webview = new WebviewWindow(label, {
								url: '/ringing/999',
								title: 'Test Alarm',
								width: 400,
								height: 500,
								resizable: false,
								alwaysOnTop: true,
								center: true,
								skipTaskbar: false,
								decorations: false,
								transparent: true,
								focus: true,
							});

							webview.once('tauri://created', () => {
								console.log('Test alarm window created successfully');
							});

							webview.once('tauri://error', (e) => {
								console.error('Test alarm window error:', e);
								console.error('Error details:', JSON.stringify(e, null, 2));
							});
						} catch (err) {
							console.error('Failed to open test alarm window:', err);
							console.error('Error type:', typeof err);
							console.error('Error details:', (err as Error).stack);
						}
					}}
					sx={{
						bgcolor: 'primary.main',
						color: 'primary.contrastText',
						'&:hover': {
							bgcolor: 'primary.dark',
						},
					}}
				>
					<span style={{ fontSize: '1.2rem' }}>🔔</span>
				</IconButton>
			</ListItem>

			{isMobile && (
				<ListItem sx={{ px }}>
					<ListItemText
						primary="Test Watch Ring"
						secondary="Send a test ring event to the connected watch"
					/>
					<IconButton
						edge="end"
						onClick={async () => {
							try {
								await invoke('test_watch_ring');
							} catch (e) {
								console.error('Failed to test watch ring:', e);
							}
						}}
						sx={{
							bgcolor: 'secondary.main',
							color: 'secondary.contrastText',
							'&:hover': {
								bgcolor: 'secondary.dark',
							},
						}}
					>
						<span style={{ fontSize: '1.2rem' }}>⌚</span>
					</IconButton>
				</ListItem>
			)}

			{isAndroid && (
				<ListItem sx={{ px }}>
					<ListItemText
						primary="Disable native watch fan-out"
						secondary="Force alarm rings through the Rust path instead of the native in-process listener"
					/>
					<Switch
						edge="end"
						checked={disableNativeFanOut}
						onChange={(e) => handleDisableNativeFanOutChange(e.target.checked)}
					/>
				</ListItem>
			)}

			<ListItem sx={{ px }}>
				<ListItemText primary="Force Synchronise" secondary="Request an immediate watch sync" />
				<IconButton
					edge="end"
					onClick={async () => {
						try {
							await AlarmService.requestSync('FORCE_SYNC');
						} catch (e) {
							console.error('Failed to request sync:', e);
						}
					}}
					sx={{
						bgcolor: 'secondary.main',
						color: 'secondary.contrastText',
						'&:hover': {
							bgcolor: 'secondary.dark',
						},
					}}
				>
					<span style={{ fontSize: '1.1rem' }}>🔄</span>
				</IconButton>
			</ListItem>

			<ListItem sx={{ px }}>
				<ListItemText
					primary="Test Notification"
					secondary="Send a test notification with actions"
				/>
				<IconButton
					edge="end"
					onClick={() => SettingsService.sendTestNotification()}
					sx={{
						bgcolor: 'secondary.main',
						color: 'secondary.contrastText',
						'&:hover': {
							bgcolor: 'secondary.dark',
						},
					}}
				>
					<span style={{ fontSize: '1.2rem' }}>📩</span>
				</IconButton>
			</ListItem>

			<ListItem sx={{ px }}>
				<ListItemText
					primary="Download Event Logs"
					secondary="Save event logs to send to the developer"
				/>
				<IconButton
					edge="end"
					onClick={handleExportLogs}
					disabled={isExportingLogs}
					sx={{
						bgcolor: 'info.main',
						color: 'info.contrastText',
						'&:hover': {
							bgcolor: 'info.dark',
						},
					}}
				>
					{isExportingLogs ? <CircularProgress size={20} color="inherit" /> : <FileDownloadIcon />}
				</IconButton>
			</ListItem>
		</List>
	);

	const renderDesktopSectionContent = () => {
		const px = 2;
		switch (activeSection) {
			case 'appearance':
				return renderAppearance(px);
			case 'alarmSettings':
				return renderAlarmSettings(px);
			case 'general':
				return renderGeneral(px);
			case 'developer':
				return renderDeveloper(px);
		}
	};

	return (
		<Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
			{/* Mobile Header */}
			{isMobile && (
				<MobileToolbar
					startAction={
						<IconButton edge="start" color="inherit" onClick={() => navigate({ to: '/home' })}>
							<ArrowBackIcon />
						</IconButton>
					}
					title="Settings"
				/>
			)}
			<Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
				{isMobile ? (
					/* --- Mobile layout: unchanged flat list --- */
					<Container maxWidth="sm" sx={{ py: 3 }}>
						<Paper elevation={0} sx={{ bgcolor: 'transparent' }}>
							{renderAppearance(2)}
							{renderAlarmSettings(2)}
							{renderGeneral(2)}
							{renderDeveloper(2)}
						</Paper>
					</Container>
				) : (
					/* --- Desktop layout: nav rail + detail panel --- */
					<>
						<Box sx={{ px: 3, pt: 2, display: 'flex', alignItems: 'center' }}>
							<IconButton onClick={() => navigate({ to: '/home' })} sx={{ mr: 2 }}>
								<ArrowBackIcon />
							</IconButton>
							<Typography variant="h4">Settings</Typography>
						</Box>

						<Box
							sx={{
								display: 'flex',
								flexDirection: 'row',
								flexGrow: 1,
								gap: 2,
								overflow: 'hidden',
								px: 3,
								pb: 3,
								pt: 2,
							}}
						>
							{/* Left nav rail */}
							<Box
								sx={{
									width: 220,
									flexShrink: 0,
									bgcolor: 'background.default',
									border: '1px solid',
									borderColor: 'divider',
									borderRadius: '14px',
									p: 1,
								}}
							>
								<List disablePadding>
									{NAV_ITEMS.map((item) => (
										<ListItemButton
											key={item.key}
											selected={activeSection === item.key}
											onClick={() => setActiveSection(item.key)}
											sx={{
												borderRadius: '10px',
												mb: 0.5,
												'&.Mui-selected': {
													bgcolor: 'primary.main',
													color: 'primary.contrastText',
													'&:hover': {
														bgcolor: 'primary.dark',
													},
												},
											}}
										>
											<ListItemText primary={item.label} />
										</ListItemButton>
									))}
								</List>
							</Box>

							{/* Right detail panel */}
							<Box
								sx={{
									flexGrow: 1,
									overflowY: 'auto',
									bgcolor: 'background.paper',
									border: '1px solid',
									borderColor: 'divider',
									borderRadius: '14px',
									p: 3,
								}}
							>
								{renderDesktopSectionContent()}
							</Box>
						</Box>
					</>
				)}

				<Dialog open={snoozeDialogOpen} onClose={() => setSnoozeDialogOpen(false)}>
					<DialogTitle>Snooze Length</DialogTitle>
					<DialogContent dividers>
						<List>
							{Array.from({ length: 30 }, (_, i) => i + 1).map((min) => (
								<ListItemButton
									key={min}
									onClick={() => {
										SettingsService.setSnoozeLength(min);
										setSnoozeLength(min);
										setSnoozeDialogOpen(false);
									}}
									selected={snoozeLength === min}
								>
									<ListItemText primary={`${min} minute${min > 1 ? 's' : ''}`} />
								</ListItemButton>
							))}
						</List>
					</DialogContent>
				</Dialog>
			</Box>
		</Box>
	);
};

export default Settings;
