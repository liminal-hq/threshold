// Renders desktop toasts as an MUI Snackbar -- there's no native OS toast primitive on
// desktop, so this is the frontend half of the toast plugin's event-based approach,
// keeping showToast() a single call path for the UI regardless of platform
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Snackbar } from '@mui/material';
import { listen } from '@tauri-apps/api/event';
import { PlatformUtils } from '../utils/PlatformUtils';

type ToastDuration = 'short' | 'long';
type ToastPosition = 'top' | 'centre' | 'bottom';

interface ToastShowEvent {
	message: string;
	duration: ToastDuration;
	position: ToastPosition;
}

// Mirrors Android's native Toast durations for rough visual parity across platforms.
const DURATION_MS: Record<ToastDuration, number> = {
	short: 2000,
	long: 3500,
};

const ANCHOR_ORIGIN: Record<ToastPosition, { vertical: 'top' | 'bottom'; horizontal: 'center' }> = {
	top: { vertical: 'top', horizontal: 'center' },
	// MUI Snackbar has no true vertical-centre anchor -- approximated below via sx override.
	centre: { vertical: 'bottom', horizontal: 'center' },
	bottom: { vertical: 'bottom', horizontal: 'center' },
};

export const DesktopToastHost: React.FC = () => {
	const [current, setCurrent] = useState<ToastShowEvent | null>(null);
	const [open, setOpen] = useState(false);
	const queueRef = useRef<ToastShowEvent[]>([]);
	const showingRef = useRef(false);

	const processQueue = useCallback(() => {
		if (showingRef.current) return;
		const next = queueRef.current.shift();
		if (!next) return;
		showingRef.current = true;
		setCurrent(next);
		setOpen(true);
	}, []);

	useEffect(() => {
		if (PlatformUtils.isMobile()) return; // mobile renders a real native Toast instead

		const unlistenPromise = listen<ToastShowEvent>('toast:show', (event) => {
			queueRef.current.push(event.payload);
			processQueue();
		});

		return () => {
			unlistenPromise.then((unlisten) => unlisten());
		};
	}, [processQueue]);

	const handleClose = (_event: unknown, reason?: string) => {
		if (reason === 'clickaway') return;
		setOpen(false);
	};

	const handleExited = () => {
		showingRef.current = false;
		setCurrent(null);
		processQueue();
	};

	if (PlatformUtils.isMobile() || !current) return null;

	return (
		<Snackbar
			open={open}
			autoHideDuration={DURATION_MS[current.duration]}
			onClose={handleClose}
			slotProps={{ transition: { onExited: handleExited } }}
			anchorOrigin={ANCHOR_ORIGIN[current.position]}
			message={current.message}
			sx={
				current.position === 'centre'
					? {
							top: '50% !important',
							left: '50% !important',
							transform: 'translate(-50%, -50%)',
						}
					: undefined
			}
		/>
	);
};
