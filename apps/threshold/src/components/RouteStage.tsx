// Wraps the router outlet, revealing the real previous screen during a predictive-back gesture
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useRouter } from '@tanstack/react-router';
import {
	predictiveBackController,
	type PredictiveBackState,
} from '../utils/PredictiveBackController';
import { screenStack } from '../utils/ScreenStack';
import { PlatformUtils } from '../utils/PlatformUtils';
import { AnimationScale } from '../utils/AnimationScale';
import { ROUTES } from '../constants';
import Home from '../screens/Home';
import EditAlarm from '../screens/EditAlarm';
import Settings from '../screens/Settings';
import '../theme/predictiveBack.css';

// Safety net for the "wait for the real navigation to land" finalize effect below -- in the
// (unexpected) case router.history.back() never actually changes location.pathname, don't
// leave the underlay stuck visible forever.
const FINALIZE_FALLBACK_MS = 1000;

/**
 * Skips the browser's View Transition for the next `router.history.back()` call.
 *
 * `router.tsx` configures `defaultViewTransition` as a per-navigation function (to compute
 * `wa-forwards`/`wa-backwards` CSS types), which is TanStack Router's documented pattern --
 * but as of @tanstack/router-core@1.151.0, `startViewTransition()` only checks whether
 * `defaultViewTransition` is *truthy*, and never actually calls it as a function (confirmed via
 * its dist/esm/router.js source, and empirically via a monkey-patched `document.startViewTransition`
 * that logged every call: it's invoked for ordinary tap navigation, but never for a
 * `router.history.back()` call preceded by this function). A function is always truthy, so
 * ordinary navigation gets an untyped `document.startViewTransition()` regardless of what our
 * function would have returned -- a genuine pre-existing bug affecting ordinary (non-gesture)
 * navigation too, not something specific to predictive-back, and out of scope to fix broadly
 * here, since no `<Link>` in this app passes an explicit `viewTransition` prop either.
 *
 * The one *documented* per-navigation override, `viewTransition: false` in `NavigateOptions`,
 * only gets wired up via `commitLocation()` (used by `navigate()`), which `history.back()`
 * bypasses entirely -- and switching to `navigate({ to, replace: true })` to reach it would
 * stop `window.history.length` from shrinking on repeated commits, breaking the
 * back-eligibility check this app already relies on elsewhere (App.tsx's hardware back
 * button, and the `canGoBack` effect above). So: set the exact internal flag `commitLocation`
 * would have set, since `startViewTransition()` reads it first
 * (`this.shouldViewTransition ?? this.options.defaultViewTransition`) and deletes it
 * immediately after reading, making this safe to poke for a single call without leaking into
 * unrelated future navigations.
 */
export function skipNextViewTransition(router: ReturnType<typeof useRouter>) {
	(router as unknown as { shouldViewTransition?: boolean }).shouldViewTransition = false;
}

/**
 * What the previous screen actually renders as, given only its path. Used solely to build the
 * predictive-back underlay -- real components with their real (simple, path-derived) params,
 * not a guess. `EditAlarm` is the only screen with a route param, threaded explicitly via
 * `idOverride` rather than relying on `useParams()` (which requires this to be the router's
 * active match, which it isn't while it's the underlay).
 */
function buildUnderlayNode(pathname: string): React.ReactNode {
	if (pathname.startsWith('/edit/')) {
		return <EditAlarm idOverride={pathname.split('/')[2]} />;
	}
	if (pathname === '/settings') {
		return <Settings />;
	}
	if (pathname === '/home' || pathname === '/') {
		return <Home />;
	}
	// Ringing (or anything unrecognised) has no underlay -- predictive back is disabled there.
	return null;
}

const RouteStage: React.FC = () => {
	const [pbState, setPbState] = useState<PredictiveBackState>({ active: false, progress: 0 });
	const [showUnderlay, setShowUnderlay] = useState(false);
	// Rendered separately from pbState.progress (rather than reading it directly) so the
	// cancelled-gesture snap-back can animate correctly -- see the effect below.
	const [displayProgress, setDisplayProgress] = useState(0);
	const [isDragging, setIsDragging] = useState(false);
	const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const rafRef = useRef<number | null>(null);
	const progressRef = useRef(0);
	progressRef.current = pbState.progress;
	// Set right before router.history.back() on commit; cleared once the finalize effect below
	// actually runs. See that effect for why this hand-off exists.
	const pendingCommitRef = useRef(false);
	const finalizeFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const location = useLocation();
	const router = useRouter();

	// Record what's currently rendered so the entry one level back is available the moment a
	// predictive-back gesture starts from wherever we navigate to next.
	useEffect(() => {
		screenStack.setCurrent(location.pathname, buildUnderlayNode(location.pathname));
	}, [location.pathname]);

	// Tell native whether there's anywhere for a back gesture to go. Mirrors the same
	// eligibility check App.tsx's hardware back-button handler already uses, so both agree.
	// Desktop's set_can_go_back is a harmless no-op, but there's still nothing for it to do
	// there -- skip the round-trip entirely, matching how router.tsx already gates
	// defaultViewTransition on PlatformUtils.isMobile().
	//
	// Deliberately checks screenStack.getPrevious() rather than window.history.length: the
	// latter is a cumulative count of every entry ever pushed this session -- it never goes
	// back down when you navigate back to an earlier screen (e.g. Home -> Settings -> Home
	// still leaves history.length at 2+), so it stays truthy forever after the first
	// navigation, wrongly enabling the gesture on Home. screenStack already tracks the
	// app's real navigation depth (collapsing back down on a return-to-earlier-screen), so
	// it's null exactly when there's genuinely nowhere left to go back to in-app.
	useEffect(() => {
		if (!PlatformUtils.isMobile()) {
			return;
		}
		const canGoBack =
			!location.pathname.startsWith(ROUTES.RINGING) &&
			screenStack.getPrevious() !== null &&
			!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		predictiveBackController.setCanGoBack(canGoBack);
	}, [location.pathname]);

	useEffect(() => predictiveBackController.subscribe(setPbState), []);

	// Track live drag progress 1:1 while the gesture is active (no-transition mode).
	useEffect(() => {
		if (pbState.active) {
			setDisplayProgress(pbState.progress);
		}
	}, [pbState.active, pbState.progress]);

	// Finalizes a committed gesture once the navigation actually lands. router.history.back()
	// is asynchronous -- the browser's popstate event (and therefore TanStack Router noticing
	// location.pathname changed) fires on a *later* tick, confirmed ~17ms later via direct
	// device logging. Hiding the underlay and resetting the top layer's transform right away
	// (in the same tick as calling history.back()) does so while <Outlet/> is still rendering
	// the outgoing screen -- with the transition still enabled, that reset visibly animates the
	// outgoing screen snapping back into view, and when the route swap lands ~17ms later
	// mid-animation, the incoming screen inherits that same still-running animation, looking
	// like it's "sliding in". Waiting for location.pathname to actually change first means the
	// reset happens once <Outlet/> already shows the real destination, so there's nothing to
	// visibly animate between the underlay and the real content -- both already show the same
	// thing in the same place.
	useEffect(() => {
		if (!pendingCommitRef.current) {
			return;
		}
		pendingCommitRef.current = false;
		if (finalizeFallbackRef.current) {
			clearTimeout(finalizeFallbackRef.current);
			finalizeFallbackRef.current = null;
		}
		setIsDragging(true);
		setShowUnderlay(false);
	}, [location.pathname]);

	useEffect(() => {
		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current);
			hideTimeoutRef.current = null;
		}
		if (rafRef.current !== null) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}

		if (pbState.active) {
			setIsDragging(true);
			setShowUnderlay(true);
			return;
		}

		// Either way, enabling the transition and moving displayProgress to its final value in
		// the very same tick wouldn't actually animate: a CSS transition only fires if the
		// property change occurs *after* a render where the transition was already active, not
		// simultaneously with un-suppressing it. So this commits one frame with wa-dragging
		// removed but the position unchanged, then moves to the target on the next frame,
		// giving the browser a valid "before" state to animate from.
		const committed = progressRef.current >= 1;
		setIsDragging(false);
		rafRef.current = requestAnimationFrame(() => {
			setDisplayProgress(committed ? 1 : 0);
			rafRef.current = null;
		});
		// AnimationScale.getSettleDurationMs() must match the CSS transition duration on
		// .wa-route-top/.wa-route-underlay (both driven by the same OS animator-duration-scale-
		// adjusted value -- AnimationScale.init() sets the CSS custom property, this reads the
		// JS-side copy) -- keeps the underlay mounted long enough to finish its settle animation
		// before disappearing/navigating.
		const settleMs = AnimationScale.getSettleDurationMs();
		hideTimeoutRef.current = setTimeout(() => {
			if (committed) {
				// Only navigate once the top layer has visibly finished sliding away, matching
				// how native Android's own predictive-back completes the motion regardless of
				// exact release point (e.g. a fast fling committing well before the drag reached
				// full visual progress) rather than snapping away abruptly. Skip the discrete
				// View Transition `router.history.back()` would otherwise replay -- see
				// skipNextViewTransition's doc comment for why that needs a workaround here.
				// The actual hide/reset is deferred to the location.pathname effect above.
				skipNextViewTransition(router);
				pendingCommitRef.current = true;
				router.history.back();
				finalizeFallbackRef.current = setTimeout(() => {
					if (pendingCommitRef.current) {
						pendingCommitRef.current = false;
						setIsDragging(true);
						setShowUnderlay(false);
					}
				}, FINALIZE_FALLBACK_MS);
			} else {
				setShowUnderlay(false);
			}
		}, settleMs);

		// Cancel pending work if a brand-new event arrives (or the effect otherwise re-runs)
		// before this one's rAF/timeout fires -- `pbState` is a fresh object every time the
		// controller updates, even for two consecutive "ended" events with no active drag in
		// between (e.g. a spurious duplicate native callback), so this effect reliably re-runs
		// for every event rather than only on active/inactive transitions.
		//
		// This also cancels a still-pending finalizeFallbackRef and resets pendingCommitRef:
		// without that, a brand-new gesture starting while a previous commit's navigation is
		// still in flight (e.g. a blocked/slow navigation, within the up-to-1-second fallback
		// window) would leave that orphaned timer free to fire mid-new-gesture, forcibly
		// hiding the underlay regardless of the new gesture's actual live state.
		return () => {
			if (hideTimeoutRef.current) {
				clearTimeout(hideTimeoutRef.current);
				hideTimeoutRef.current = null;
			}
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
			if (finalizeFallbackRef.current) {
				clearTimeout(finalizeFallbackRef.current);
				finalizeFallbackRef.current = null;
			}
			pendingCommitRef.current = false;
		};
	}, [pbState, router]);

	const previous = screenStack.getPrevious();
	const progress = displayProgress;
	const shouldRenderUnderlay = showUnderlay && previous !== null;

	const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 400;
	const topClassName = `wa-route-top${isDragging ? ' wa-dragging' : ''}`;
	const underlayClassName = `wa-route-underlay${isDragging ? ' wa-dragging' : ''}`;

	const topStyle: React.CSSProperties = shouldRenderUnderlay
		? { transform: `translateX(${progress * windowWidth}px)`, opacity: 1 - progress }
		: {};
	const underlayStyle: React.CSSProperties = shouldRenderUnderlay
		? { transform: `scale(${0.95 + 0.05 * progress})` }
		: {};

	return (
		<div className="wa-route-stage">
			{shouldRenderUnderlay && (
				<div className={underlayClassName} style={underlayStyle}>
					{previous!.node}
					<div className="wa-route-underlay-scrim" style={{ opacity: 1 - progress }} />
				</div>
			)}
			<div className={topClassName} style={topStyle}>
				<Outlet />
			</div>
		</div>
	);
};

export default RouteStage;
