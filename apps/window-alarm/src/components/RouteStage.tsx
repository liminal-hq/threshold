import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useRouter } from '@tanstack/react-router';
import { predictiveBackController, PredictiveBackState } from '../utils/PredictiveBackController';
import { getComponentForPath } from '../utils/RouteRegistry';
import '../theme/predictiveBack.css';

const RouteStage: React.FC = () => {
    const [pbState, setPbState] = useState<PredictiveBackState>({ active: false, progress: 0, edge: 'left' });
    const location = useLocation();
    const router = useRouter();

    // We need to keep track of the *previous* location to render the underlay.
    // TanStack Router doesn't expose the history stack directly in a way we can just "peek" easily
    // without tracking it ourselves or using internal history.
    // `router.history` is available.
    // Let's assume a simple stack tracking for now.

    // Actually, we can use a ref to store the "last" location before the current one?
    // No, we need the one that we would go back TO.
    // If we are at C, back goes to B.
    // We need to know B when we are at C.
    // Since we don't have a robust history manager exposed here, we might need to rely on `window.history`.
    // But `window.history` doesn't give us the *path* of the previous entry for security reasons.

    // Solution: We need to maintain a local history stack in our App or here.
    // For this component, let's try to infer it or rely on a global store if we had one.
    // Since we don't, let's build a simple one using `location` changes.

    // Refined stack logic:
    // We need to know "what is under this card".
    // If we assume linear navigation for this app (which it mostly is):
    // Home is root.
    // Edit is above Home.
    // Settings is above Home (or Edit).
    // Ringing is special.

    // Let's use a simpler heuristic for the "Previous" page based on known app flow:
    // If on /edit/*, underlay is /home.
    // If on /settings, underlay is /home (or whatever we came from).
    // If on /home, no underlay (can't go back).

    // Let's use the explicit `window.history.length` check to know if we CAN go back.
    // But to know *what* to render, we need the path.
    // Let's try to track it.

    useEffect(() => {
        // When location changes:
        // If new location is NOT the one we just had, push current to a "local stack"?
        // This is getting complicated to robustly implement inside a component without global context.
        // For the sake of the task, let's use a specific "Previous Page" determination for Tier 2A:

        // 1. If at /edit/:id, underlay is likely /home.
        // 2. If at /settings, underlay is likely /home.
        // 3. If at /ringing, predictive back is disabled.

        // This covers 90% of the app's use cases.
    }, [location.pathname]);


    // Subscribe to predictive back events
    useEffect(() => {
        const unsub = predictiveBackController.subscribe((state) => {
            setPbState(state);
            if (state.progress === 1 && !state.active) {
                // Invoked/Committed.
                // The native side animation finished (visually 100%).
                // Now we perform the actual navigation.
                // We should ensure we don't re-trigger animation.
                 router.history.back();
            }
        });
        return unsub;
    }, [router]);

    // Determine underlay component
    let underlayComponent: React.ReactNode = null;
    const currentPath = location.pathname;

    if (currentPath.startsWith('/edit/')) {
        underlayComponent = getComponentForPath('/home');
    } else if (currentPath === '/settings') {
        underlayComponent = getComponentForPath('/home');
    }
    // TODO: Improve this to be true history stack if possible later.

    const isSwipeActive = pbState.active;
    const progress = pbState.progress;

    // Visual transforms
    // Top layer moves right (translate X)
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 400;
    const translateX = progress * windowWidth;

    // Underlay scale/opacity effect (Tier 1/2 polish)
    // Scale 0.95 -> 1.0
    // Opacity 0.5 -> 1.0 (if using scrim)
    const underlayScale = 0.95 + (0.05 * progress);
    // const underlayOpacity = 0.3 + (0.7 * progress); // Fade in?

    // Styles
    const topStyle: React.CSSProperties = isSwipeActive ? {
        transform: `translateX(${translateX}px)`,
        boxShadow: '-4px 0 16px rgba(0,0,0,0.2)' // Shadow on the left edge
    } : {};

    const underlayStyle: React.CSSProperties = isSwipeActive ? {
        transform: `scale(${underlayScale})`,
        opacity: 1 // We render fully but maybe behind a scrim?
    } : { display: 'none' }; // Hide underlay when not swiping to save resources?
    // Actually, keeping it hidden is good.

    return (
        <div className="wa-route-stage">
            {isSwipeActive && underlayComponent && (
                <div className="wa-route-underlay" style={underlayStyle}>
                    <div className="wa-route-underlay-content">
                         {underlayComponent}
                    </div>
                    <div className="wa-route-underlay-scrim" style={{ opacity: 1 - progress }} />
                </div>
            )}

            {/*
               If we use Tier 1 (fallback), we might just show a solid color or pattern
               if underlayComponent is null.
            */}
            {isSwipeActive && !underlayComponent && (
                 <div className="wa-route-underlay tier-1" style={{ backgroundColor: 'var(--background-default)' }} />
            )}

            <div className="wa-route-top" style={topStyle}>
                <Outlet />
            </div>
        </div>
    );
};

export default RouteStage;
