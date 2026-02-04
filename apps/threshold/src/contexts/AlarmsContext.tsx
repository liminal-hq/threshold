import React, { createContext, useContext, useEffect, useState } from 'react';
import { AlarmRecord } from '../types/alarm';
import { AlarmService } from '../services/AlarmService';

interface AlarmsContextType {
    alarms: AlarmRecord[];
    isLoading: boolean;
    refresh: () => Promise<void>;
}

const AlarmsContext = createContext<AlarmsContextType | undefined>(undefined);

export const AlarmsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadAlarms = async () => {
        try {
            console.log('[AlarmsContext] Loading alarms...');
            const data = await AlarmService.getAll();
            console.log(`[AlarmsContext] Loaded ${data.length} alarms`);
            setAlarms(data);
            setIsLoading(false);
        } catch (e) {
            console.error('[AlarmsContext] Failed to load alarms:', e);
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadAlarms();

        // Subscribe to changes
        const unlistenPromise = AlarmService.subscribe((updatedAlarms) => {
            console.log('[AlarmsContext] Received alarms:changed event', updatedAlarms);
            setAlarms(updatedAlarms);
        });

        return () => {
            unlistenPromise.then(unlisten => unlisten());
        };
    }, []);

    return (
        <AlarmsContext.Provider value={{ alarms, isLoading, refresh: loadAlarms }}>
            {children}
        </AlarmsContext.Provider>
    );
};

export const useAlarms = () => {
    const context = useContext(AlarmsContext);
    if (context === undefined) {
        throw new Error('useAlarms must be used within an AlarmsProvider');
    }
    return context;
};
