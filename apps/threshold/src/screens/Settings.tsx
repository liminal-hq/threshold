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
    CircularProgress
} from '@mui/material';
import { MobileToolbar } from '../components/MobileToolbar';
import { ArrowBack as ArrowBackIcon, FileDownload as FileDownloadIcon } from '@mui/icons-material';
import { useNavigate } from '@tanstack/react-router';
import { PlatformUtils } from '../utils/PlatformUtils';
import { SettingsService, Theme } from '../services/SettingsService';
import { alarmManagerService } from '../services/AlarmManagerService';
import { useThemeContext } from '../contexts/ThemeContext';
import { eventLogService } from '../services/EventLogService';

const Settings: React.FC = () => {
    const navigate = useNavigate();
    const {
        theme, setTheme,
        forceDark, setForceDark,
        useMaterialYou, setUseMaterialYou
    } = useThemeContext();
    const [is24h, setIs24h] = useState<boolean>(SettingsService.getIs24h());
    const [isMobile, setIsMobile] = useState(false);
    const [isAndroid, setIsAndroid] = useState(false);

    // New Settings State
    const [silenceAfter, setSilenceAfter] = useState<number>(SettingsService.getSilenceAfter());
    const [snoozeLength, setSnoozeLength] = useState<number>(SettingsService.getSnoozeLength());
    const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
    const [isExportingLogs, setIsExportingLogs] = useState(false);

    useEffect(() => {
        setIsMobile(PlatformUtils.isMobile());
        setIsAndroid(PlatformUtils.getPlatform() === 'android');
    }, []);

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

    return (

        <Box sx={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Mobile Header: Placed OUTSIDE IonContent to avoid scrolling issues and overlay */}
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
            <Box sx={{ flexGrow: 1 }}>
                {/* Desktop Spacing Fix: Adjusted mt to 2 to work with RootLayout spacing */}
                <Container maxWidth="sm" sx={{ py: 3, mt: !isMobile ? 2 : 0 }}>
                    {!isMobile && (
                        <Box sx={{ mb: 4, display: 'flex', alignItems: 'center' }}>
                            <IconButton onClick={() => navigate({ to: '/home' })} sx={{ mr: 2 }}>
                                <ArrowBackIcon />
                            </IconButton>
                            <Typography variant="h4">Settings</Typography>
                        </Box>
                    )}

                    <Paper elevation={0} sx={{ bgcolor: 'transparent' }}>
                        <List subheader={<ListSubheader sx={{ bgcolor: 'transparent' }}>Appearance</ListSubheader>}>
                            <ListItem sx={{ px: isMobile ? 2 : 0 }}>
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

                            {/* Material You Toggle: Only visible for System Theme on Android */}
                            {theme === 'system' && isAndroid && (
                                <ListItem sx={{ px: isMobile ? 2 : 0 }}>
                                    <ListItemText
                                        primary="Use Material You"
                                        secondary="Use dynamic system colours"
                                    />
                                    <Switch
                                        edge="end"
                                        checked={useMaterialYou}
                                        onChange={(e) => setUseMaterialYou(e.target.checked)}
                                    />
                                </ListItem>
                            )}

                            <ListItem sx={{ px: isMobile ? 2 : 0 }}>
                                <ListItemText
                                    primary="Force Dark Mode"
                                    secondary="Override system colour scheme"
                                />
                                <Switch
                                    edge="end"
                                    checked={forceDark}
                                    onChange={(e) => setForceDark(e.target.checked)}
                                />
                            </ListItem>
                        </List>

                        <List subheader={<ListSubheader sx={{ bgcolor: 'transparent', mt: 2 }}>Alarm Settings</ListSubheader>}>
                            <ListItem sx={{ px: isMobile ? 2 : 0 }}>
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

                            <ListItemButton onClick={() => setSnoozeDialogOpen(true)} sx={{ px: isMobile ? 2 : 0 }}>
                                <ListItemText
                                    primary="Snooze Length"
                                    secondary={`${snoozeLength} minute${snoozeLength > 1 ? 's' : ''}`}
                                />
                            </ListItemButton>
                        </List>

                        <List subheader={<ListSubheader sx={{ bgcolor: 'transparent', mt: 2 }}>General</ListSubheader>}>
                            <ListItem sx={{ px: isMobile ? 2 : 0 }}>
                                <ListItemText
                                    primary="24-Hour Time"
                                    secondary="Use 24-hour format for time display"
                                />
                                <Switch
                                    edge="end"
                                    checked={is24h}
                                    onChange={(e) => handleTimeFormatChange(e.target.checked)}
                                />
                            </ListItem>
                        </List>

                        <List subheader={<ListSubheader sx={{ bgcolor: 'transparent', mt: 2 }}>Developer</ListSubheader>}>
                            <ListItem sx={{ px: isMobile ? 2 : 0 }}>
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
                                            const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
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
                                        }
                                    }}
                                >
                                    <span style={{ fontSize: '1.2rem' }}>🔔</span>
                                </IconButton>
                            </ListItem>

                            <ListItem sx={{ px: isMobile ? 2 : 0 }}>
                                <ListItemText
                                    primary="Test Notification"
                                    secondary="Send a test notification with actions"
                                />
                                <IconButton
                                    edge="end"
                                    onClick={() => alarmManagerService.sendTestNotification()}
                                    sx={{
                                        bgcolor: 'secondary.main',
                                        color: 'secondary.contrastText',
                                        '&:hover': {
                                            bgcolor: 'secondary.dark',
                                        }
                                    }}
                                >
                                    <span style={{ fontSize: '1.2rem' }}>📩</span>
                                </IconButton>
                            </ListItem>

                            <ListItem sx={{ px: isMobile ? 2 : 0 }}>
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
                                        }
                                    }}
                                >
                                    {isExportingLogs ? (
                                        <CircularProgress size={20} color="inherit" />
                                    ) : (
                                        <FileDownloadIcon />
                                    )}
                                </IconButton>
                            </ListItem>
                        </List>
                    </Paper>
                </Container>

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
