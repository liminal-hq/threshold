import { createRootRoute, createRoute, createRouter, Outlet, redirect, useLocation } from '@tanstack/react-router';
import { TitleBar } from './components/TitleBar';
import { NotFound } from './components/NotFound';
import { PlatformUtils } from './utils/PlatformUtils';
import { useEffect, useState } from 'react';
import Home from './screens/Home';
import EditAlarm from './screens/EditAlarm';
import Ringing from './screens/Ringing';
import Settings from './screens/Settings';

// Root layout component
const RootLayout = () => {
    console.log('🚀 [threshold] RootLayout rendering, path:', window.location.pathname);
    const [isMobile, setIsMobile] = useState(false);
    const location = useLocation();

    useEffect(() => {
        setIsMobile(PlatformUtils.isMobile());
    }, []);

    // Don't show TitleBar for ringing window (it's a separate floating window)
    const isRingingWindow = location.pathname.startsWith('/ringing');
    const showTitleBar = !isMobile && !isRingingWindow;

    return (
        <>
            {showTitleBar && <TitleBar />}
            <div style={{ marginTop: showTitleBar ? '32px' : '0px', height: showTitleBar ? 'calc(100% - 32px)' : '100%' }}>
                <Outlet />
            </div>
        </>
    );
};

// Define Routes
const rootRoute = createRootRoute({
    component: RootLayout,
});

const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/home',
    component: Home,
});

// Redirect root to home
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null, // We'll handle redirect in router config or component
    beforeLoad: () => {
        throw redirect({ to: '/home' });
    }
});

const editAlarmRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/edit/$id',
    component: EditAlarm,
});

const ringingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/ringing/$id',
    component: Ringing,
});

const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: Settings,
});

const routeTree = rootRoute.addChildren([indexRoute, homeRoute, editAlarmRoute, ringingRoute, settingsRoute]);

export const router = createRouter({
    routeTree,
    defaultNotFoundComponent: NotFound
});

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router;
    }
}
