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
} from '@mui/icons-material';

import { PlatformUtils } from '../utils/PlatformUtils';
import { useNavigate } from '@tanstack/react-router';
import { AlarmItem } from '../components/AlarmItem';
import { NextAlarmBanner } from '../components/NextAlarmBanner';
import { PullToRefresh } from '../components/PullToRefresh';
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
                    menuItems={[
                        { label: 'Settings', onClick: handleSettingsClick }
                    ]}
                />
            )}

            <Container maxWidth={false} sx={{
                mt: 0,
                pt: 2,
                pb: 10,
                px: 2,
                flexGrow: 1
            }}>
                <NextAlarmBanner alarms={alarms} is24h={is24h} />
                {isMobile ? (
                    <PullToRefresh onRefresh={refresh}>
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
                    </PullToRefresh>
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
                bgcolor: 'background.paper',
                borderTop: '1px solid',
                borderColor: 'divider'
            } : {
                position: 'fixed',
                bottom: 32,
                right: 32,
                zIndex: 1000
            }}>
                {!isMobile ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                        <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                            <Button
                                variant="contained"
                                color="secondary"
                                startIcon={<AddIcon />}
                                onClick={handleAdd}
                                sx={{ maxWidth: 400, width: '100%' }}
                            >
                                Add Alarm
                            </Button>
                        </Box>
                        <IconButton onClick={handleSettingsClick} aria-label="settings" sx={{ position: 'absolute', right: 0 }}>
                            <SettingsOutlinedIcon />
                        </IconButton>
                    </Box>
                ) : (
                    <Fab
                        color="secondary"
                        aria-label="add"
                        onClick={handleAdd}
                        size="large"
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
