import React, { useEffect, useState } from 'react';
import {
    AppBar,
    Toolbar,
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
import { Close as CloseIcon } from '@mui/icons-material';
import { TimePicker as MuiTimePicker } from '@mui/x-date-pickers/TimePicker';
import { TimePicker as DesktopCustomTimePicker } from '../components/TimePicker';
import { useParams, useNavigate } from '@tanstack/react-router';
import { platform } from '@tauri-apps/plugin-os';
import { databaseService } from '../services/DatabaseService';
import { alarmManagerService } from '../services/AlarmManagerService';
import { DaySelector } from '../components/DaySelector';
import { SettingsService } from '../services/SettingsService';
import { parse, format } from 'date-fns';

const EditAlarm: React.FC = () => {
    const { id } = useParams({ from: '/edit/$id' });
    const navigate = useNavigate();
    const isNew = id === 'new';
    const is24h = SettingsService.getIs24h();
    const [isMobile, setIsMobile] = useState(false);

    const [label, setLabel] = useState('');
    const [mode, setMode] = useState<'FIXED' | 'WINDOW'>('FIXED');
    const [activeDays, setActiveDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
    const [fixedTime, setFixedTime] = useState('07:00');
    const [windowStart, setWindowStart] = useState('07:00');
    const [windowEnd, setWindowEnd] = useState('07:30');

    useEffect(() => {
        const os = platform();
        setIsMobile(os === 'ios' || os === 'android');
    }, []);

    useEffect(() => {
        if (!isNew) {
            loadAlarm(parseInt(id));
        }
    }, [id]);

    const loadAlarm = async (alarmId: number) => {
        const alarms = await databaseService.getAllAlarms();
        const alarm = alarms.find((a) => a.id === alarmId);
        if (alarm) {
            setLabel(alarm.label || '');
            setMode(alarm.mode);
            setActiveDays(alarm.activeDays);
            if (alarm.fixedTime) setFixedTime(alarm.fixedTime);
            if (alarm.windowStart) setWindowStart(alarm.windowStart);
            if (alarm.windowEnd) setWindowEnd(alarm.windowEnd);
        }
    };

    const handleSave = async () => {
        if (activeDays.length === 0) {
            alert('Please select at least one day for the alarm to repeat.');
            return;
        }

        const alarmData: any = {
            label,
            mode,
            activeDays,
            enabled: true,
        };

        if (mode === 'FIXED') {
            alarmData.fixedTime = fixedTime;
        } else {
            alarmData.windowStart = windowStart;
            alarmData.windowEnd = windowEnd;
        }

        if (!isNew) {
            alarmData.id = parseInt(id);
        }

        try {
            await alarmManagerService.saveAndSchedule(alarmData);
            navigate({ to: '/home' }); // Go back to home
        } catch (e) {
            console.error('Failed to save alarm:', e);
            alert('Failed to save alarm. Please try again.');
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
                <AppBar position="sticky" elevation={0} sx={{ paddingTop: 'env(safe-area-inset-top)' }}>
                    <Toolbar>
                        <IconButton edge="start" color="inherit" onClick={() => navigate({ to: '/home' })}>
                            <CloseIcon />
                        </IconButton>
                        <Typography variant="h6" sx={{ flexGrow: 1, ml: 2 }}>
                            {isNew ? 'New Alarm' : 'Edit Alarm'}
                        </Typography>
                        <Button color="inherit" onClick={handleSave}>
                            Save
                        </Button>
                    </Toolbar>
                </AppBar>
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
                                <ToggleButton value="FIXED">Fixed Time</ToggleButton>
                                <ToggleButton value="WINDOW">Window</ToggleButton>
                            </ToggleButtonGroup>

                            {mode === 'FIXED' ? (
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
