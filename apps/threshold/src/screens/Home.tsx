import React, { useState, useEffect } from 'react';
import {
    IconButton,
    Fab,
    List,
    Box,
    Button,
    Container
} from '@mui/material';
import { MobileToolbar } from '../components/MobileToolbar';
import {
    Add as AddIcon,
    SettingsOutlined as SettingsOutlinedIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material';

import { PlatformUtils } from '../utils/PlatformUtils';
import { useNavigate } from '@tanstack/react-router';
import { AlarmItem } from '../components/AlarmItem';
import { SettingsService } from '../services/SettingsService';
import { APP_NAME } from '../constants';
import { AlarmService } from '../services/AlarmService';
import { useAlarms } from '../contexts/AlarmsContext';
import { AlarmRecord } from '../types/alarm';

const Home: React.FC = () => {
    const navigate = useNavigate();
    const { alarms, refresh } = useAlarms();
    const [isMobile, setIsMobile] = useState(false);
    const is24h = SettingsService.getIs24h();

    useEffect(() => {
        setIsMobile(PlatformUtils.isMobile());
    }, []);

    const handleSettingsClick = () => {
        navigate({ to: '/settings' });
    };

    const handleToggle = async (alarm: AlarmRecord, enabled: boolean) => {
        await AlarmService.toggle(alarm.id, enabled);
    };

    const handleDelete = async (id: number) => {
        console.log(`[DELETE_DEBUG] handleDelete called for id: ${id}`);
        try {
            await AlarmService.delete(id);
        } catch (e) {
            console.error(`[DELETE_DEBUG] ERROR in handleDelete:`, e);
        }
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
                <MobileToolbar
                    title={APP_NAME}
                    endAction={
                        <IconButton color="inherit" onClick={() => refresh()}>
                            <RefreshIcon />
                        </IconButton>
                    }
                    menuItems={[
                        { label: 'Settings', onClick: handleSettingsClick }
                    ]}
                />
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
                    alarms.map((alarm) => (
                        <AlarmItem
                            key={alarm.id}
                            alarm={alarm}
                            is24h={is24h}
                            onToggle={(enabled) => handleToggle(alarm, enabled)}
                            onDelete={() => handleDelete(alarm.id)}
                            onClick={() => handleEdit(alarm.id)}
                        />
                    ))
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
