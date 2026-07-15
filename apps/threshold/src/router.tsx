// TanStack Router route tree definition
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import {
	createRootRoute,
	createRoute,
	createRouter,
	redirect,
	useLocation,
} from '@tanstack/react-router';
import { TitleBar } from './components/TitleBar';
import { NotFound } from './components/NotFound';
import { PlatformUtils } from './utils/PlatformUtils';
import Home from './screens/Home';
import EditAlarm from './screens/EditAlarm';
import Ringing from './screens/Ringing';
import Settings from './screens/Settings';
import { routeTransitions } from './utils/RouteTransitions';
import RouteStage from './components/RouteStage';

// Root layout component
const RootLayout = () => {
	console.log('🚀 [threshold] RootLayout rendering, path:', window.location.pathname);
	const isMobile = PlatformUtils.isMobile();
	const location = useLocation();

	// Don't show TitleBar for ringing window (it's a separate floating window)
	const isRingingWindow = location.pathname.startsWith('/ringing');
	const showTitleBar = !isMobile && !isRingingWindow;

	return (
		<>
			{showTitleBar && <TitleBar />}
			<div
				className="wa-route-slot"
				style={{
					marginTop: showTitleBar ? '32px' : '0px',
					height: showTitleBar ? 'calc(100% - 32px)' : '100%',
					// NOTE: despite the name, this is no longer the element that actually scrolls.
					// <RouteStage/> (rendered as this div's only child) wraps routed content in
					// .wa-route-stage (overflow: hidden, for the predictive-back gesture layer) and
					// .wa-route-top (its own overflow-y: auto) -- .wa-route-top is the real per-
					// screen scroll viewport now (see predictiveBack.css and PullToRefresh.tsx's
					// getScrollParent()). This overflowY is kept as a fallback in case RouteStage
					// ever renders content that bypasses .wa-route-top, not as the primary scroller.
					// Individual screens still should not manage their own height/overflow.
					// Ringing opts out locally (see ringing.css) since it's a small fixed-size
					// surface that shouldn't scroll.
					overflowY: isRingingWindow ? 'hidden' : 'auto',
					// @ts-ignore - viewTransitionName is not yet in standard React types
					viewTransitionName: isMobile ? 'wa-route-slot' : undefined,
				}}
			>
				<RouteStage />
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
	},
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

const routeTree = rootRoute.addChildren([
	indexRoute,
	homeRoute,
	editAlarmRoute,
	ringingRoute,
	settingsRoute,
]);

// Create base router options
const routerOptions: any = {
	routeTree,
	defaultNotFoundComponent: NotFound,
};

// Only enable View Transitions on mobile (Android/iOS)
// This is critical because enabling it on Linux Desktop (WebKitGTK) causes a hard native crash,
// even if the function returns false. The key must be completely absent.
if (PlatformUtils.isMobile()) {
	routerOptions.defaultViewTransition = ({ location }: { location: any }) => {
		// 0. Mobile check (redundant but safe)
		if (!PlatformUtils.isMobile()) {
			return false;
		}

		// 1. Check if allowed
		if (!routeTransitions.shouldAnimate()) {
			return false;
		}

		const toPath = location.pathname;

		// 2. Skip ringing
		if (toPath.startsWith('/ringing')) {
			return false;
		}

		// 3. Determine direction
		const direction = routeTransitions.getDirection(toPath);

		if (direction === 'none') {
			return false;
		}

		// 4. Return types
		return {
			types: ['wa-slide', `wa-${direction}`],
		};
	};
}

export const router = createRouter(routerOptions);

// Inject router into AlarmManagerService to avoid dynamic import cycles
import { alarmManagerService } from './services/AlarmManagerService';
alarmManagerService.setRouter(router);

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
