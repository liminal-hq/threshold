import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RouteTransitions } from './RouteTransitions';
import { PlatformUtils } from './PlatformUtils';

// Mock PlatformUtils
vi.mock('./PlatformUtils', () => ({
    PlatformUtils: {
        getPlatform: vi.fn()
    }
}));

describe('RouteTransitions', () => {
    let routeTransitions: RouteTransitions;

    beforeEach(() => {
        // Mock document.startViewTransition
        // @ts-ignore
        global.document = {
            ...global.document,
            startViewTransition: vi.fn()
        } as any;

        // Mock window.location
        // @ts-ignore
        global.window = {
            ...global.window,
            location: { pathname: '/initial' } as any
        } as any;

        routeTransitions = new RouteTransitions();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('shouldAnimate returns true only on Android with API support', () => {
        vi.mocked(PlatformUtils.getPlatform).mockReturnValue('android');
        expect(routeTransitions.shouldAnimate()).toBe(true);

        vi.mocked(PlatformUtils.getPlatform).mockReturnValue('ios');
        expect(routeTransitions.shouldAnimate()).toBe(false);

        // Remove API support
        // @ts-ignore
        delete global.document.startViewTransition;
        vi.mocked(PlatformUtils.getPlatform).mockReturnValue('android');
        expect(routeTransitions.shouldAnimate()).toBe(false);
    });

    it('calculates direction correctly', () => {
        // Setup for Android
        vi.mocked(PlatformUtils.getPlatform).mockReturnValue('android');

        // Initial state: ['/initial']

        // Navigate forward
        let dir = routeTransitions.getDirection('/next');
        expect(dir).toBe('forwards');

        // Navigate forward again
        dir = routeTransitions.getDirection('/deep');
        expect(dir).toBe('forwards');

        // Navigate back to /next
        dir = routeTransitions.getDirection('/next');
        expect(dir).toBe('backwards');

        // Navigate back to /initial
        dir = routeTransitions.getDirection('/initial');
        expect(dir).toBe('backwards');
    });

    it('respects overrides', () => {
        vi.mocked(PlatformUtils.getPlatform).mockReturnValue('android');

        routeTransitions.setNextDirection('backwards');

        // Even if we go to a new page, it should treat as backwards if overridden
        const dir = routeTransitions.getDirection('/anywhere');
        expect(dir).toBe('backwards');
    });
});
