import React, { useState, useEffect } from 'react';
import {
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Fab,
    List,
    Box,
    Button,
    Container
} from '@mui/material';
import {
    Add as AddIcon,
    MoreVert as MoreVertIcon,
    SettingsOutlined as SettingsOutlinedIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material';
import { SwipeableList } from 'react-swipeable-list';
import { PlatformUtils } from '../utils/PlatformUtils';
import { useNavigate } from '@tanstack/react-router';
import { Alarm } from '../services/DatabaseService';
import { alarmManagerService } from '../services/AlarmManagerService';
import { AlarmItem } from '../components/AlarmItem';
import { SettingsService } from '../services/SettingsService';

const Home: React.FC = () => {
    const navigate = useNavigate();
    const [alarms, setAlarms] = useState<Alarm[]>([]);
    const [isMobile, setIsMobile] = useState(false);
    const is24h = SettingsService.getIs24h();

    useEffect(() => {
        setIsMobile(PlatformUtils.isMobile());
    }, []);

    const loadData = async () => {
        try {
            console.log('[Home] Loading data...');
            await alarmManagerService.init();
            console.log('[Home] AlarmManager initialized, loading alarms...');
            const data = await alarmManagerService.loadAlarms();
            console.log(`[Home] Loaded ${data.length} alarms`);
            setAlarms(data);
        } catch (e) {
            console.error('[Home] Failed to load alarms', e);
        }
    };

    // Use effect instead of useIonViewWillEnter
    useEffect(() => {
        loadData();

        const handleAlarmsChanged = () => {
            console.log('[Home] Alarms changed, reloading...');
            loadData();
        };

        document.addEventListener('alarms-changed', handleAlarmsChanged);
        return () => {
            document.removeEventListener('alarms-changed', handleAlarmsChanged);
        };
    }, []);

    const handleToggle = async (alarm: Alarm, enabled: boolean) => {
        await alarmManagerService.toggleAlarm(alarm, enabled);
        loadData();
    };

    const handleDelete = async (id: number) => {
        // Optimistic update: Remove immediately from UI
        setAlarms(prev => prev.filter(a => a.id !== id));
        // Then call backend
        await alarmManagerService.deleteAlarm(id);
        // Reload to ensure sync (optional if optimistic is trusted, but good safety)
        loadData();
    };

    const handleEdit = (id: number) => {
        navigate({ to: '/edit/$id', params: { id: id.toString() } });
    };

    const handleAdd = () => {
        navigate({ to: '/edit/$id', params: { id: 'new' } });
    };

    return (
        <Box sx={{ minHeight: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {isMobile && (
                <AppBar position="sticky" elevation={0} sx={{ paddingTop: 'env(safe-area-inset-top)' }}>
                    <Toolbar>
                        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                            Window Alarm
                        </Typography>
                        <IconButton color="inherit" onClick={() => loadData()}>
                            <RefreshIcon />
                        </IconButton>
                        <IconButton color="inherit" onClick={() => navigate({ to: '/settings' })}>
                            <MoreVertIcon />
                        </IconButton>
                    </Toolbar>
                </AppBar>
            )}

            {/* Desktop settings button */}
            {!isMobile && (
                <Box sx={{
                    position: 'fixed',
                    top: '48px',
                    right: '16px',
                    zIndex: 1000
                }}>
                    <IconButton onClick={() => navigate({ to: '/settings' })} size="large">
                        <SettingsOutlinedIcon />
                    </IconButton>
                </Box>
            )}

            <Container maxWidth={false} sx={{
                mt: !isMobile ? 8 : 0,
                pt: isMobile ? 2 : 0, // Add top padding on mobile to clear header/prevent blend
                pb: 10,
                px: 2, // Always add padding for "inset" bubble look
                flexGrow: 1
            }}>
                {isMobile ? (
                    <SwipeableList
                        threshold={0.25}
                        fullSwipe={true}
                    >
                        {alarms.map((alarm) => (
                            <AlarmItem
                                key={alarm.id}
                                alarm={alarm}
                                is24h={is24h}
                                onToggle={(enabled) => handleToggle(alarm, enabled)}
                                onDelete={() => handleDelete(alarm.id)}
                                onClick={() => handleEdit(alarm.id)}
                            />
                        ))}
                    </SwipeableList>
                ) : (
                    <List>
                        {alarms.map((alarm) => (
                            <AlarmItem
                                key={alarm.id}
                                alarm={alarm}
                                is24h={is24h}
                                onToggle={(enabled) => handleToggle(alarm, enabled)}
                                onDelete={() => handleDelete(alarm.id)}
                                onClick={() => handleEdit(alarm.id)}
                            />
                        ))}
                    </List>
                )}
            </Container>

            {/* Floating Add Button */}
            <Box sx={!isMobile ? {
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 1000,
                p: 2,
                bgcolor: 'background.paper', // Ensure it has background on desktop footer
                borderTop: '1px solid',
                borderColor: 'divider'
            } : {
                position: 'fixed',
                bottom: 32, // More breathing room from bottom
                right: 32,  // More breathing room from right
                zIndex: 1000
            }}>
                {!isMobile ? (
                    <Button
                        variant="contained"
                        color="secondary"
                        fullWidth
                        startIcon={<AddIcon />}
                        onClick={handleAdd}
                        sx={{ maxWidth: 400, mx: 'auto', display: 'flex' }}
                    >
                        Add Alarm
                    </Button>
                ) : (
                    <Fab
                        color="secondary"
                        aria-label="add"
                        onClick={handleAdd}
                        size="large" // Larger button for better ergonomics
                        sx={{ borderRadius: '16px' }}
                    >
                        <AddIcon />
                    </Fab>
                )}
            </Box>
        </Box>
    );
};

export default Home;
