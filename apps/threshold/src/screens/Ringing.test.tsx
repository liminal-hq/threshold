// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Ringing from './Ringing';
import { alarmManagerService } from '../services/AlarmManagerService';
import { PlatformUtils } from '../utils/PlatformUtils';
import { SPECIAL_ALARM_IDS, ROUTES } from '../constants';
import * as tauriWindow from '@tauri-apps/api/window';

// --- Mocks ---

vi.mock('../services/AlarmManagerService', () => ({
    alarmManagerService: {
        init: vi.fn(),
        isInitialized: vi.fn(() => true),
        loadAlarms: vi.fn(),
        stopRinging: vi.fn(),
        snoozeAlarm: vi.fn(),
    }
}));

vi.mock('../services/SettingsService', () => ({
    SettingsService: {
        getSnoozeLength: vi.fn(() => 10),
        getSilenceAfter: vi.fn(() => 20),
        getTheme: vi.fn(() => 'boring-dark'),
        getForceDark: vi.fn(() => false),
    }
}));

vi.mock('../utils/PlatformUtils', () => ({
    PlatformUtils: {
        isDesktop: vi.fn(),
        isMobile: vi.fn(),
        getPlatform: vi.fn(() => 'test-os'),
    }
}));

vi.mock('@tauri-apps/api/window', () => ({
    getCurrentWindow: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(() => Promise.resolve(() => {})),
    emit: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
    convertFileSrc: vi.fn((src) => src),
    invoke: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
    useParams: vi.fn(),
    useNavigate: vi.fn(),
}));

// Mock Audio (Global)
window.AudioContext = vi.fn().mockImplementation(() => ({
    createOscillator: () => ({
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: { setValueAtTime: vi.fn() },
        type: 'square'
    }),
    createGain: () => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
    }),
    state: 'suspended',
    resume: vi.fn(),
    currentTime: 0,
    destination: {}
}));

describe('Ringing Screen Logic', () => {
    const mockNavigate = vi.fn();
    const mockWindow = {
        close: vi.fn(),
        minimize: vi.fn(),
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        
        // Setup Router Mock
        const router = await import('@tanstack/react-router');
        (router.useNavigate as any).mockReturnValue(mockNavigate);
        (router.useParams as any).mockReturnValue({ id: '1' });

        // Setup Window Mock
        (tauriWindow.getCurrentWindow as any).mockReturnValue(mockWindow);
        
        // Setup Alarm Mock default
        (alarmManagerService.loadAlarms as any).mockResolvedValue([
            { id: 1, label: 'Morning Alarm', time: '08:00', enabled: true, days: [], soundUri: '' }
        ]);
        
        // Setup Platform Default (Desktop)
        (PlatformUtils.isDesktop as any).mockReturnValue(true);
        (PlatformUtils.isMobile as any).mockReturnValue(false);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should show the alarm label', async () => {
        render(<Ringing />);
        expect(await screen.findByText('Morning Alarm')).toBeInTheDocument();
    });

    it('should close window on desktop when dismissed', async () => {
        // Arrange
        (PlatformUtils.isDesktop as any).mockReturnValue(true);
        (PlatformUtils.isMobile as any).mockReturnValue(false);

        // Act
        render(<Ringing />);
        
        const stopBtn = await screen.findByRole('button', { name: /stop alarm/i });
        fireEvent.click(stopBtn);

        // Assert
        expect(alarmManagerService.stopRinging).toHaveBeenCalled();
        expect(mockWindow.close).toHaveBeenCalled();
        expect(mockWindow.minimize).not.toHaveBeenCalled();
    });

    it('should minimize window on mobile when dismissed', async () => {
        // Arrange
        (PlatformUtils.isDesktop as any).mockReturnValue(false);
        (PlatformUtils.isMobile as any).mockReturnValue(true);

        // Act
        render(<Ringing />);
        
        const stopBtn = await screen.findByRole('button', { name: /stop alarm/i });
        fireEvent.click(stopBtn);

        // Assert
        expect(alarmManagerService.stopRinging).toHaveBeenCalled();
        expect(mockWindow.close).not.toHaveBeenCalled();
        expect(mockWindow.minimize).toHaveBeenCalled();
        
        // Should navigate to home after delay
        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith({ to: ROUTES.HOME, replace: true });
        });
    });

    it('should navigate back for Test Alarm (ID 999) on mobile', async () => {
        // Arrange
        (PlatformUtils.isDesktop as any).mockReturnValue(false);
        (PlatformUtils.isMobile as any).mockReturnValue(true);
        const router = await import('@tanstack/react-router');
        (router.useParams as any).mockReturnValue({ id: String(SPECIAL_ALARM_IDS.TEST_ALARM) });
        
        const historySpy = vi.spyOn(window.history, 'back');

        // Act
        // Test alarm 999 won't load from DB, so label might be empty, but buttons present
        render(<Ringing />);
        
        const stopBtn = await screen.findByRole('button', { name: /stop alarm/i });
        fireEvent.click(stopBtn);

        // Assert
        expect(alarmManagerService.stopRinging).toHaveBeenCalled();
        expect(historySpy).toHaveBeenCalled();
        expect(mockWindow.minimize).not.toHaveBeenCalled();
    });
});
