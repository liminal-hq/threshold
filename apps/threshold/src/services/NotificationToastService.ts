// Handles event-driven toast presentation for notification-related UI feedback
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import { listen } from '@tauri-apps/api/event';
import { showToast } from 'tauri-plugin-toast-api';
import { PlatformUtils } from '../utils/PlatformUtils';
import type { NotificationToastEvent } from './AlarmNotificationService';

const EVENT_NOTIFICATIONS_TOAST = 'notifications:toast';

export class NotificationToastService {
	private initPromise: Promise<void> | null = null;

	public async init(): Promise<void> {
		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			await listen<NotificationToastEvent>(EVENT_NOTIFICATIONS_TOAST, async (event) => {
				await this.show(event.payload);
			});
		})();

		return this.initPromise;
	}

	private async show(payload: NotificationToastEvent): Promise<void> {
		if (!payload?.message) return;

		const platform = PlatformUtils.getPlatform();
		if (payload.platform === 'android' && platform !== 'android') return;
		if (payload.platform === 'ios' && platform !== 'ios') return;
		if (payload.platform === 'desktop' && PlatformUtils.isMobile()) return;

		try {
			await showToast({
				message: payload.message,
				duration: 'short',
				position: 'bottom',
			});
		} catch (e) {
			console.warn('[NotificationToastService] Failed to show toast', e);
		}
	}
}

export const notificationToastService = new NotificationToastService();
