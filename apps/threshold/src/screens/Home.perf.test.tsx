// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import Home from './Home';
import { SettingsService } from '../services/SettingsService';
import { alarmManagerService } from '../services/AlarmManagerService';

// Mock dependencies
vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('../services/AlarmManagerService', () => ({
    alarmManagerService: {
        init: vi.fn().mockResolvedValue(undefined),
        loadAlarms: vi.fn().mockResolvedValue([]),
        toggleAlarm: vi.fn(),
        deleteAlarm: vi.fn(),
    },
}));

vi.mock('../components/MobileToolbar', () => ({
    MobileToolbar: () => <div>Toolbar</div>,
}));

vi.mock('../components/AlarmItem', () => ({
    AlarmItem: () => <div>AlarmItem</div>,
}));

vi.mock('../utils/PlatformUtils', () => ({
    PlatformUtils: {
        isMobile: vi.fn().mockReturnValue(false),
    },
}));

// Mock SettingsService
vi.mock('../services/SettingsService', () => ({
    SettingsService: {
        getIs24h: vi.fn().mockReturnValue(true),
    },
}));

// Mock Tauri APIs
vi.mock('@tauri-apps/api/event', () => ({
    emit: vi.fn(),
    listen: vi.fn(() => Promise.resolve(() => {})),
}));

describe('Home Screen Performance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should access SettingsService.getIs24h() only once on mount', async () => {
        // Setup initial alarms to cause a state update
        const alarms = [{ id: 1, time: '10:00', enabled: true, label: 'Test', days: [], soundUri: '' }];
        (alarmManagerService.loadAlarms as any).mockResolvedValue(alarms);

        // Render
        render(<Home />);

        // Initial render (Mount) -> getIs24h called once.
        // useEffect -> loadData -> loadAlarms -> setAlarms(alarms) -> Re-render.
        // Re-render -> getIs24h called again (if unoptimized).

        await waitFor(() => expect(alarmManagerService.loadAlarms).toHaveBeenCalled());

        // Wait for potential re-renders to settle
        await new Promise(resolve => setTimeout(resolve, 50));

        const callCount = (SettingsService.getIs24h as any).mock.calls.length;
        console.log(`[Perf Baseline] SettingsService.getIs24h called ${callCount} times`);

        // Expectation for optimized code: strictly 1 call
        expect(callCount).toBe(1);
    });
});
