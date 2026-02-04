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
    Paper
} from '@mui/material';
import { MobileToolbar } from '../components/MobileToolbar';
import { Close as CloseIcon } from '@mui/icons-material';
import { TimePicker as MuiTimePicker } from '@mui/x-date-pickers/TimePicker';
import { TimePicker as DesktopCustomTimePicker } from '../components/TimePicker';
import { useNavigate, useParams } from '@tanstack/react-router';
import { PlatformUtils } from '../utils/PlatformUtils';
import { DaySelector } from '../components/DaySelector';
import { SettingsService } from '../services/SettingsService';
import { parse, format } from 'date-fns';
import { AlarmService } from '../services/AlarmService';
import { AlarmInput, AlarmMode } from '../types/alarm';
import { alarmSoundPickerService } from '../services/AlarmSoundPickerService';
import { MusicNote as MusicNoteIcon, ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import { Select, MenuItem, FormControl, SelectChangeEvent } from '@mui/material';

const BUNDLED_ALARMS = [
	{ title: 'Ambient Drone', uri: '/alarms/ambient_drone.flac' }
];

const EditAlarm: React.FC = () => {
    const { id } = useParams({ from: '/edit/$id' });
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
            alert('Please select at least one day for the alarm to repeat.');
            return;
        }

        const alarmData: AlarmInput = {
            label,
            mode,
            activeDays,
            enabled: true,
            soundUri,
            soundTitle
        };

        if (mode === AlarmMode.Fixed) {
            alarmData.fixedTime = fixedTime;
        } else {
            alarmData.windowStart = windowStart;
            alarmData.windowEnd = windowEnd;
        }

        if (!isNew) {
            alarmData.id = parseInt(id);
        }

        try {
            await AlarmService.save(alarmData);
            navigate({ to: '/home' }); // Go back to home
        } catch (e) {
            console.error('Failed to save alarm:', e);
            alert('Failed to save alarm. Please try again.');
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
			const found = BUNDLED_ALARMS.find(s => s.uri === val);
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
				title: 'Select Alarm Sound'
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
        <Box sx={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
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
            <Box sx={{ flexGrow: 1 }}>
                <Container maxWidth="sm" sx={{
                    py: 3,
                    mt: !isMobile ? 2 : 0,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    {!isMobile && (
                        <Box sx={{ mb: 4 }}>
                            <Typography variant="h4" gutterBottom>
                                {isNew ? 'New Alarm' : 'Edit Alarm'}
                            </Typography>
                        </Box>
                    )}

                    <Stack spacing={3} sx={{ flexGrow: 1, pb: !isMobile ? 10 : 0 }}>
                        <Paper elevation={0} sx={{ p: isMobile ? 0 : 3, bgcolor: 'transparent' }}>
                            <ToggleButtonGroup
                                value={mode}
                                exclusive
                                onChange={(_, val) => { if (val) setMode(val); }}
                                fullWidth
                                color="primary"
                                sx={{ mb: 3 }}
                            >
                                <ToggleButton value={AlarmMode.Fixed}>Fixed Time</ToggleButton>
                                <ToggleButton value={AlarmMode.RandomWindow}>Window</ToggleButton>
                            </ToggleButtonGroup>

                            {mode === AlarmMode.Fixed ? (
                                <Box sx={{ mb: 3 }}>
                                    {isMobile ? (
                                        <MuiTimePicker
                                            label="Time"
                                            value={parseTime(fixedTime)}
                                            onChange={(newValue) => handleTimeChange(newValue, setFixedTime)}
                                            ampm={!is24h}
                                            slotProps={{ textField: { fullWidth: true } }}
                                        />
                                    ) : (
                                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                                            <DesktopCustomTimePicker
                                                value={fixedTime}
                                                onChange={setFixedTime}
                                                is24h={is24h}
                                            />
                                        </div>
                                    )}
                                </Box>
                            ) : (
                                <Stack spacing={2} sx={{ mb: 3 }}>
                                    {isMobile ? (
                                        <>
                                            <MuiTimePicker
                                                label="Start Window"
                                                value={parseTime(windowStart)}
                                                onChange={(newValue) => handleTimeChange(newValue, setWindowStart)}
                                                ampm={!is24h}
                                                slotProps={{ textField: { fullWidth: true } }}
                                            />
                                            <MuiTimePicker
                                                label="End Window"
                                                value={parseTime(windowEnd)}
                                                onChange={(newValue) => handleTimeChange(newValue, setWindowEnd)}
                                                ampm={!is24h}
                                                slotProps={{ textField: { fullWidth: true } }}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <Typography variant="subtitle2" align="center">Start Window</Typography>
                                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                <DesktopCustomTimePicker
                                                    value={windowStart}
                                                    onChange={setWindowStart}
                                                    is24h={is24h}
                                                />
                                            </div>
                                            <Typography variant="subtitle2" align="center">End Window</Typography>
                                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                <DesktopCustomTimePicker
                                                    value={windowEnd}
                                                    onChange={setWindowEnd}
                                                    is24h={is24h}
                                                />
                                            </div>
                                        </>
                                    )}
                                    <FormHelperText sx={{ textAlign: 'center' }}>
                                        Alarm will ring once randomly between these times.
                                    </FormHelperText>
                                </Stack>
                            )}

                            <TextField
                                label="Label"
                                placeholder="Alarm Label (e.g. Wake Up)"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                fullWidth
                                variant="outlined"
                                sx={{ mb: 3 }}
                            />

                            <Box>
                                <Typography variant="subtitle2" gutterBottom>Repeats</Typography>
                                <DaySelector selectedDays={activeDays} onChange={setActiveDays} />
                            </Box>

							<Box sx={{ mt: 3 }}>
								<Typography variant="subtitle2" gutterBottom>Sound</Typography>
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
											borderRadius: 1
										}}
									>
										<MusicNoteIcon sx={{ mr: 2, color: 'text.secondary' }} />
										<Box sx={{ flexGrow: 1 }}>
											<Typography variant="body1">
												{soundTitle || 'System Default'}
											</Typography>
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
												
												const bundled = BUNDLED_ALARMS.find(b => b.uri === selected);
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
											
											{BUNDLED_ALARMS.map(sound => (
												<MenuItem key={sound.uri} value={sound.uri}>
													{sound.title}
												</MenuItem>
											))}

											{/* If we have a custom sound URI that is NOT in the bundled list, show it here so the Select holds its value */}
											{soundUri && !BUNDLED_ALARMS.find(b => b.uri === soundUri) && (
												<MenuItem value={soundUri}>
													{soundTitle || soundUri.split(/[/\\]/).pop()}
												</MenuItem>
											)}

											<MenuItem value="PICK_FILE" sx={{ fontStyle: 'italic', color: 'primary.main' }}>
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
                        <Box sx={{
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
                            gap: 2
                        }}>
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
        </Box>
    );
};

export default EditAlarm;
