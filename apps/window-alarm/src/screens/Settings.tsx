import React, { useState, useEffect } from 'react';
import {
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    List,
    ListItem,
    ListItemText,
    Switch,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Box,
    Container,
    ListSubheader,
    Paper
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useNavigate } from '@tanstack/react-router';
import { platform } from '@tauri-apps/plugin-os';
import { SettingsService, Theme } from '../services/SettingsService';
import { useThemeContext } from '../contexts/ThemeContext';

const Settings: React.FC = () => {
    const navigate = useNavigate();
    const { theme, setTheme, forceDark, setForceDark } = useThemeContext();
    const [is24h, setIs24h] = useState<boolean>(SettingsService.getIs24h());
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const os = platform();
        setIsMobile(os === 'ios' || os === 'android');
    }, []);

    const handleTimeFormatChange = (enabled: boolean) => {
        setIs24h(enabled);
        SettingsService.setIs24h(enabled);
    };

    return (

        <Box sx={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Mobile Header: Placed OUTSIDE IonContent to avoid scrolling issues and overlay */}
            {isMobile && (
                <AppBar position="sticky" elevation={0} sx={{ paddingTop: 'env(safe-area-inset-top)' }}>
                    <Toolbar>
                        <IconButton edge="start" color="inherit" onClick={() => navigate({ to: '/home' })}>
                            <ArrowBackIcon />
                        </IconButton>
                        <Typography variant="h6" sx={{ flexGrow: 1, ml: 2 }}>
                            Settings
                        </Typography>
                    </Toolbar>
                </AppBar>
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
                                        <MenuItem value="deep-night">Deep Night (Default)</MenuItem>
                                        <MenuItem value="canadian-cottage">Canadian Cottage Winter</MenuItem>
                                        <MenuItem value="georgian-bay-plunge">Georgian Bay Plunge</MenuItem>
                                        <MenuItem value="boring-light">Boring Light</MenuItem>
                                        <MenuItem value="boring-dark">Boring Dark</MenuItem>
                                    </Select>
                                </FormControl>
                            </ListItem>

                            <ListItem sx={{ px: isMobile ? 2 : 0 }}>
                                <ListItemText
                                    primary="Force Dark Mode"
                                    secondary="Override system color scheme"
                                />
                                <Switch
                                    edge="end"
                                    checked={forceDark}
                                    onChange={(e) => setForceDark(e.target.checked)}
                                />
                            </ListItem>
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
                    </Paper>
                </Container>
            </Box>
        </Box>
    );
};

export default Settings;
