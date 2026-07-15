// Create/edit alarm form screen
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import React, { useEffect, useState } from 'react';
import {
	Typography,
	IconButton,
	Button,
	Box,
	Container,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Stack,
	FormHelperText,
	Paper,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogContentText,
	DialogActions,
} from '@mui/material';
import { MobileToolbar } from '../components/MobileToolbar';
import { Close as CloseIcon } from '@mui/icons-material';
import { TimePicker as MuiTimePicker } from '@mui/x-date-pickers/TimePicker';
import { TimePicker as DesktopCustomTimePicker } from '../components/TimePicker/TimePicker';
import { useNavigate, useParams } from '@tanstack/react-router';
import { PlatformUtils } from '../utils/PlatformUtils';
import { DaySelector } from '../components/DaySelector';
import { SettingsService } from '../services/SettingsService';
import { parse, format } from 'date-fns';
import { AlarmService } from '../services/AlarmService';
import { AlarmInput, AlarmMode } from '../types/alarm';
import { alarmSoundPickerService } from '../services/AlarmSoundPickerService';
import { showToast } from 'tauri-plugin-toast-api';
import { UI } from '../theme/uiTokens';
import { MusicNote as MusicNoteIcon, ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import { Select, MenuItem, FormControl, SelectChangeEvent } from '@mui/material';

const BUNDLED_ALARMS = [{ title: 'Ambient Drone', uri: '/alarms/ambient_drone.flac' }];

interface EditAlarmProps {
	// Set only when RouteStage renders this screen standalone as the predictive-back underlay
	// (i.e. it isn't the router's actual active match, so `useParams({ from: '/edit/$id' })`
	// would throw). Read straight from the underlay's cached path, not guessed.
	idOverride?: string;
}

const EditAlarm: React.FC<EditAlarmProps> = ({ idOverride }) => {
	const params = useParams({ strict: false });
	const id = idOverride ?? (params.id as string);
	const navigate = useNavigate();
	const isNew = id === 'new';
	const is24h = SettingsService.getIs24h();
	const [isMobile, setIsMobile] = useState(false);

	const [label, setLabel] = useState('');
	const [mode, setMode] = useState<AlarmMode>(AlarmMode.Fixed);
	const [activeDays, setActiveDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]); // Every day default

	// Default to next hour ceiling
	// e.g. if 10:15, default to 11:00
	// if 10:00, default to 11:00
	const nextHour = new Date();
	nextHour.setHours(nextHour.getHours() + 1);
	nextHour.setMinutes(0);
	const defaultTimeStr = format(nextHour, 'HH:mm');
	const defaultEndStr = format(new Date(nextHour.getTime() + 30 * 60000), 'HH:mm');

	const [fixedTime, setFixedTime] = useState(defaultTimeStr);
	const [windowStart, setWindowStart] = useState(defaultTimeStr);
	const [windowEnd, setWindowEnd] = useState(defaultEndStr);

	const [soundUri, setSoundUri] = useState<string | null>(null);
	const [soundTitle, setSoundTitle] = useState<string | null>(null);

	const [daysError, setDaysError] = useState(false);
	const [imminentTrigger, setImminentTrigger] = useState<number | null>(null);
	// Set once the imminent-trigger dialog below fires for a brand new alarm -- AlarmService.save
	// always persists before that check runs, so the row already exists at that point even though
	// the route is still "/edit/new". Without this, choosing "Adjust" and saving again would save
	// with no id and create a second, duplicate alarm instead of updating the one just created.
	const [savedAlarmId, setSavedAlarmId] = useState<number | null>(null);

	// Minutes-until-trigger below which we warn the user before leaving the screen --
	// catches an accidental Start/End swap in Window mode producing a near-term ring.
	const IMMINENT_TRIGGER_THRESHOLD_MINUTES = 30;

	useEffect(() => {
		setIsMobile(PlatformUtils.isMobile());
	}, []);

	useEffect(() => {
		if (!isNew) {
			loadAlarm(parseInt(id));
		}
	}, [id]);

	const loadAlarm = async (alarmId: number) => {
		try {
			const alarm = await AlarmService.get(alarmId);
			if (alarm) {
				setLabel(alarm.label || '');
				setMode(alarm.mode);
				setActiveDays(alarm.activeDays);
				if (alarm.fixedTime) setFixedTime(alarm.fixedTime);
				if (alarm.windowStart) setWindowStart(alarm.windowStart);
				if (alarm.windowEnd) setWindowEnd(alarm.windowEnd);
				setSoundUri(alarm.soundUri || null);
				setSoundTitle(alarm.soundTitle || null);
			}
		} catch (e) {
			console.error('Failed to load alarm', e);
			// navigate({ to: '/home' }); // Optional: redirect if not found
		}
	};

	const handleSave = async () => {
		if (activeDays.length === 0) {
			setDaysError(true);
			return;
		}

		if (mode === AlarmMode.Window && windowStart === windowEnd) {
			// Inline error already shown below the time pickers -- the scheduler
			// rejects a zero-length window outright, so don't even round-trip it.
			return;
		}

		const alarmData: AlarmInput = {
			label,
			mode,
			activeDays,
			enabled: true,
			soundUri,
			soundTitle,
		};

		if (mode === AlarmMode.Fixed) {
			alarmData.fixedTime = fixedTime;
		} else {
			alarmData.windowStart = windowStart;
			alarmData.windowEnd = windowEnd;
		}

		if (!isNew) {
			alarmData.id = parseInt(id);
		} else if (savedAlarmId !== null) {
			alarmData.id = savedAlarmId;
		}

		try {
			const saved = await AlarmService.save(alarmData);

			if (saved.nextTrigger) {
				const minutesUntil = (saved.nextTrigger - Date.now()) / 60000;
				if (minutesUntil >= 0 && minutesUntil <= IMMINENT_TRIGGER_THRESHOLD_MINUTES) {
					setSavedAlarmId(saved.id);
					setImminentTrigger(saved.nextTrigger);
					return;
				}
			}

			navigate({ to: '/home' });
		} catch (e) {
			console.error('Failed to save alarm:', e);
			try {
				await showToast({ message: 'Failed to save alarm. Please try again.', duration: 'long' });
			} catch (toastError) {
				console.warn('[EditAlarm] Failed to show save-failure toast', toastError);
			}
		}
	};

	// AlarmService.save (above) already persisted and scheduled this alarm before this dialog
	// could even appear -- "Adjust" only closes the dialog, it doesn't undo that. Without this,
	// a user who chooses "Adjust" and then abandons the screen (back button, app switch) instead
	// of saving again leaves a live, scheduled alarm they explicitly declined to confirm. Disable
	// it immediately so it can't ring until the user actually re-saves; a subsequent Save (via
	// savedAlarmId, above) re-enables it as part of the normal update.
	const handleAdjust = async () => {
		setImminentTrigger(null);
		if (savedAlarmId === null) return;
		try {
			await AlarmService.toggle(savedAlarmId, false);
		} catch (e) {
			console.error('Failed to disable unconfirmed alarm', e);
		}
	};

	const handleSoundChange = async (event: SelectChangeEvent) => {
		const val = event.target.value;

		if (val === 'PICK_FILE') {
			// Trigger file picker
			handlePickSound();
		} else if (val === 'DEFAULT') {
			setSoundUri(null);
			setSoundTitle(null);
		} else {
			// Bundled sound
			const found = BUNDLED_ALARMS.find((s) => s.uri === val);
			if (found) {
				setSoundUri(found.uri);
				setSoundTitle(found.title);
			} else {
				// It might be a custom file previously picked that is not in the bundled list
				// In this case, we just keep it as is, but this branch shouldn't technically be hit
				// by the select change unless we add it to the menu items.
				setSoundUri(val);
			}
		}
	};

	const handlePickSound = async () => {
		try {
			const result = await alarmSoundPickerService.pickAlarmSound({
				existingUri: soundUri,
				title: 'Select Alarm Sound',
			});
			setSoundUri(result.uri);
			setSoundTitle(result.title);
		} catch (error: any) {
			if (error.message !== 'cancelled') {
				console.error('Failed to pick sound:', error);
			}
		}
	};

	const parseTime = (timeStr: string) => {
		try {
			return parse(timeStr, 'HH:mm', new Date());
		} catch (e) {
			return new Date();
		}
	};

	const handleTimeChange = (newValue: Date | null, setter: (s: string) => void) => {
		if (newValue && !isNaN(newValue.getTime())) {
			setter(format(newValue, 'HH:mm'));
		}
	};

	return (
		<Box>
			{/* Mobile Header: Placed OUTSIDE IonContent to avoid scrolling issues and overlay */}
			{isMobile && (
				<MobileToolbar
					startAction={
						<IconButton edge="start" color="inherit" onClick={() => navigate({ to: '/home' })}>
							<CloseIcon />
						</IconButton>
					}
					title={isNew ? 'New Alarm' : 'Edit Alarm'}
					endAction={
						<Button color="inherit" onClick={handleSave}>
							Save
						</Button>
					}
				/>
			)}
			<Box>
				<Container
					maxWidth={isMobile ? 'sm' : false}
					sx={{
						py: isMobile ? 3 : 2,
						mt: 0,
						px: isMobile ? 2 : 4,
						...(!isMobile && { maxWidth: 700 }),
					}}
				>
					{!isMobile && (
						<Box sx={{ mb: 2 }}>
							<Typography variant="h4" gutterBottom>
								{isNew ? 'New Alarm' : 'Edit Alarm'}
							</Typography>
						</Box>
					)}

					<Stack spacing={2} sx={{ pb: !isMobile ? 10 : 0 }}>
						<Paper elevation={0} sx={{ p: 0, bgcolor: 'transparent' }}>
							<ToggleButtonGroup
								value={mode}
								exclusive
								onChange={(_, val) => {
									if (val) setMode(val);
								}}
								fullWidth
								color="primary"
								sx={{ mb: 2 }}
							>
								<ToggleButton value={AlarmMode.Fixed}>Fixed Time</ToggleButton>
								<ToggleButton value={AlarmMode.Window}>Window</ToggleButton>
							</ToggleButtonGroup>

							{mode === AlarmMode.Fixed ? (
								<Box sx={{ mb: 2 }}>
									{isMobile ? (
										<MuiTimePicker
											label="Time"
											value={parseTime(fixedTime)}
											onChange={(newValue) => handleTimeChange(newValue, setFixedTime)}
											ampm={!is24h}
											// Match the Label field below: set the radius directly on the
											// actual bordered element rather than clipping an outer Box to a
											// different radius than the field's own default border curve,
											// which left the corners looking mismatched/cut off.
											slotProps={{
												textField: {
													fullWidth: true,
													sx: {
														'& .MuiOutlinedInput-root': { borderRadius: UI.card.borderRadius },
													},
												},
											}}
										/>
									) : (
										<Box
											sx={{
												display: 'flex',
												justifyContent: 'center',
												borderRadius: UI.card.borderRadius,
											}}
										>
											<DesktopCustomTimePicker
												value={fixedTime}
												onChange={setFixedTime}
												is24h={is24h}
											/>
										</Box>
									)}
								</Box>
							) : (
								<Stack spacing={2} sx={{ mb: 2 }}>
									{isMobile ? (
										<>
											<MuiTimePicker
												label="Start Window"
												value={parseTime(windowStart)}
												onChange={(newValue) => handleTimeChange(newValue, setWindowStart)}
												ampm={!is24h}
												slotProps={{
													textField: {
														fullWidth: true,
														sx: {
															'& .MuiOutlinedInput-root': { borderRadius: UI.card.borderRadius },
														},
													},
												}}
											/>
											<MuiTimePicker
												label="End Window"
												value={parseTime(windowEnd)}
												onChange={(newValue) => handleTimeChange(newValue, setWindowEnd)}
												ampm={!is24h}
												slotProps={{
													textField: {
														fullWidth: true,
														sx: {
															'& .MuiOutlinedInput-root': { borderRadius: UI.card.borderRadius },
														},
													},
												}}
											/>
										</>
									) : (
										<Box sx={{ display: 'flex', gap: 2 }}>
											<Box sx={{ flex: 1, minWidth: 0 }}>
												<Typography variant="subtitle2" gutterBottom>
													Start Window
												</Typography>
												<Box
													sx={{
														display: 'flex',
														justifyContent: 'center',
														borderRadius: UI.card.borderRadius,
														'& .time-picker-container': {
															padding: '8px',
															gap: '8px',
														},
														'& .time-value-input': {
															width: '60px',
															fontSize: '1.6rem',
															padding: '8px 0',
														},
														'& .time-control-btn': {
															width: '32px',
															height: '26px',
														},
													}}
												>
													<DesktopCustomTimePicker
														value={windowStart}
														onChange={setWindowStart}
														is24h={is24h}
													/>
												</Box>
											</Box>
											<Box sx={{ flex: 1, minWidth: 0 }}>
												<Typography variant="subtitle2" gutterBottom>
													End Window
												</Typography>
												<Box
													sx={{
														display: 'flex',
														justifyContent: 'center',
														borderRadius: UI.card.borderRadius,
														'& .time-picker-container': {
															padding: '8px',
															gap: '8px',
														},
														'& .time-value-input': {
															width: '60px',
															fontSize: '1.6rem',
															padding: '8px 0',
														},
														'& .time-control-btn': {
															width: '32px',
															height: '26px',
														},
													}}
												>
													<DesktopCustomTimePicker
														value={windowEnd}
														onChange={setWindowEnd}
														is24h={is24h}
													/>
												</Box>
											</Box>
										</Box>
									)}
									<FormHelperText sx={{ textAlign: 'center' }}>
										Alarm will ring once randomly between these times.
									</FormHelperText>
									{windowStart === windowEnd ? (
										<FormHelperText error sx={{ textAlign: 'center' }}>
											Start and end times must be different.
										</FormHelperText>
									) : (
										windowEnd < windowStart && (
											<FormHelperText sx={{ textAlign: 'center' }}>
												This window crosses midnight -- it starts today and ends the next day.
											</FormHelperText>
										)
									)}
								</Stack>
							)}

							<TextField
								label="Label"
								placeholder="Alarm Label (e.g. Wake Up)"
								value={label}
								onChange={(e) => setLabel(e.target.value)}
								fullWidth
								variant="outlined"
								// Without this, the floating label only shrinks on focus/value -- since this
								// field always has a placeholder rendered underneath it, the empty/unfocused
								// state shows "Label" sitting on top of the placeholder text instead of
								// floated above the outline.
								InputLabelProps={{ shrink: true }}
								sx={{
									mb: 2,
									'& .MuiOutlinedInput-root': {
										borderRadius: UI.card.borderRadius,
									},
								}}
							/>

							<Box>
								<Typography variant="subtitle2" gutterBottom>
									Repeats
								</Typography>
								<DaySelector
									selectedDays={activeDays}
									onChange={(days) => {
										setActiveDays(days);
										if (days.length > 0) setDaysError(false);
									}}
								/>
								{daysError && (
									<FormHelperText error>
										Select at least one day for the alarm to repeat.
									</FormHelperText>
								)}
							</Box>

							<Box sx={{ mt: 3 }}>
								<Typography variant="subtitle2" gutterBottom>
									Sound
								</Typography>
								{isMobile ? (
									<Paper
										variant="outlined"
										onClick={handlePickSound}
										sx={{
											p: 2,
											display: 'flex',
											alignItems: 'center',
											cursor: 'pointer',
											'&:hover': { bgcolor: 'action.hover' },
											borderRadius: UI.card.borderRadius,
											bgcolor: 'background.paper',
											borderColor: 'divider',
										}}
									>
										<MusicNoteIcon sx={{ mr: 2, color: 'text.secondary' }} />
										<Box sx={{ flexGrow: 1 }}>
											<Typography variant="body1">{soundTitle || 'System Default'}</Typography>
										</Box>
										<ChevronRightIcon color="action" />
									</Paper>
								) : (
									<FormControl fullWidth>
										<Select
											value={
												// If null/undefined -> DEFAULT
												// If in bundled list -> uri
												// If custom file -> use the uri itself (we'll render a special item for it)
												!soundUri ? 'DEFAULT' : soundUri
											}
											onChange={handleSoundChange}
											displayEmpty
											renderValue={(selected) => {
												if (selected === 'DEFAULT') return 'System Default';
												if (selected === 'PICK_FILE') return 'Pick specific file...'; // Transient state

												const bundled = BUNDLED_ALARMS.find((b) => b.uri === selected);
												if (bundled) return bundled.title;

												// If it's a custom path, show title if available, else show truncated path
												if (soundTitle) return soundTitle;
												return selected.split(/[/\\]/).pop();
											}}
										>
											<MenuItem value="DEFAULT">
												<MusicNoteIcon sx={{ mr: 1, fontSize: 20, color: 'text.secondary' }} />
												System Default
											</MenuItem>

											{BUNDLED_ALARMS.map((sound) => (
												<MenuItem key={sound.uri} value={sound.uri}>
													{sound.title}
												</MenuItem>
											))}

											{/* If we have a custom sound URI that is NOT in the bundled list, show it here so the Select holds its value */}
											{soundUri && !BUNDLED_ALARMS.find((b) => b.uri === soundUri) && (
												<MenuItem value={soundUri}>
													{soundTitle || soundUri.split(/[/\\]/).pop()}
												</MenuItem>
											)}

											<MenuItem
												value="PICK_FILE"
												sx={{ fontStyle: 'italic', color: 'primary.main' }}
											>
												Pick specific file...
											</MenuItem>
										</Select>
									</FormControl>
								)}
							</Box>
						</Paper>
					</Stack>

					{/* Fixed Footer for Desktop */}
					{!isMobile && (
						<Box
							sx={{
								position: 'fixed',
								bottom: 0,
								left: 0,
								right: 0,
								p: 2,
								bgcolor: 'background.paper',
								borderTop: '1px solid',
								borderColor: 'divider',
								zIndex: 100,
								display: 'flex',
								justifyContent: 'flex-end',
								gap: 2,
							}}
						>
							<Button variant="outlined" onClick={() => navigate({ to: '/home' })}>
								Cancel
							</Button>
							<Button variant="contained" color="secondary" onClick={handleSave}>
								Save Alarm
							</Button>
						</Box>
					)}
				</Container>
			</Box>

			<Dialog open={imminentTrigger !== null} onClose={() => setImminentTrigger(null)}>
				<DialogTitle>This alarm will ring soon</DialogTitle>
				<DialogContent>
					<DialogContentText>
						{imminentTrigger &&
							`This alarm's next trigger is around ${format(
								new Date(imminentTrigger),
								'h:mm a',
							)}, less than ${IMMINENT_TRIGGER_THRESHOLD_MINUTES} minutes from now. Keep it as configured, or go back and adjust the times?`}
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleAdjust}>Adjust</Button>
					<Button variant="contained" onClick={() => navigate({ to: '/home' })}>
						Keep It
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
};

export default EditAlarm;
