// Mocks the Tauri IPC layer (via @tauri-apps/api/mocks) with an in-memory alarm store so the
// real React app renders in a plain browser for screenshots
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT
//
// Throwaway dev harness -- not part of the shipped app. Must be imported before anything that
// touches @tauri-apps/api, @tauri-apps/plugin-os, or the router.

import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import type { AlarmInput, AlarmRecord } from '../src/types/alarm';

// Read the harness options before the URL is rewritten below.
//   ?seed=empty|populated   -- initial alarm list
//   ?platform=linux|android -- what PlatformUtils.isMobile() sees (drives the mobile layout)
const params = new URLSearchParams(window.location.search);
const seed = params.get('seed') ?? 'populated';
const platformName = params.get('platform') ?? 'linux';
const isAndroid = platformName === 'android';

// --- Platform globals the plugin-os package reads synchronously ---------------------------------

(window as any).__TAURI_OS_PLUGIN_INTERNALS__ = {
	platform: platformName,
	family: 'unix',
	os_type: platformName,
	version: isAndroid ? '14' : '6.0.0',
	arch: isAndroid ? 'aarch64' : 'x86_64',
	eol: '\n',
	exe_extension: '',
};

mockWindows('main');

// Pin the router's initial location: the router is created at module-evaluation time from
// window.location, and the harness page itself lives at /dev-harness/index.html.
window.history.replaceState(null, '', '/home');

// --- Seed data -----------------------------------------------------------------------------------

function nextOccurrence(hhmm: string, activeDays: number[], from = new Date()): Date {
	const [h, m] = hhmm.split(':').map(Number);
	for (let offset = 0; offset < 8; offset++) {
		const candidate = new Date(from);
		candidate.setDate(candidate.getDate() + offset);
		candidate.setHours(h, m, 0, 0);
		if (candidate.getTime() <= from.getTime()) continue;
		if (activeDays.includes(candidate.getDay())) return candidate;
	}
	return from;
}

// Deterministic "random" minute in the window so screenshots are reproducible.
function nextWindowTrigger(start: string, end: string, activeDays: number[]): number {
	const startDate = nextOccurrence(start, activeDays);
	const [eh, em] = end.split(':').map(Number);
	const endDate = new Date(startDate);
	endDate.setHours(eh, em, 0, 0);
	if (endDate.getTime() <= startDate.getTime()) endDate.setDate(endDate.getDate() + 1);
	const spanMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60_000);
	const pick = Math.floor(spanMinutes * 0.6);
	return startDate.getTime() + pick * 60_000;
}

function computeNextTrigger(a: Omit<AlarmRecord, 'nextTrigger' | 'revision'>): number | null {
	if (!a.enabled) return null;
	if (a.mode === 'FIXED' && a.fixedTime) {
		return nextOccurrence(a.fixedTime, a.activeDays).getTime();
	}
	if (a.mode === 'WINDOW' && a.windowStart && a.windowEnd) {
		return nextWindowTrigger(a.windowStart, a.windowEnd, a.activeDays);
	}
	return null;
}

let revision = 1;
let nextId = 1;
let alarms: AlarmRecord[] = [];

function makeAlarm(input: AlarmInput): AlarmRecord {
	const base = {
		id: input.id ?? nextId++,
		label: input.label ?? null,
		enabled: input.enabled,
		mode: input.mode,
		fixedTime: input.fixedTime ?? null,
		windowStart: input.windowStart ?? null,
		windowEnd: input.windowEnd ?? null,
		activeDays: input.activeDays,
		soundUri: input.soundUri ?? null,
		soundTitle: input.soundTitle ?? null,
	};
	if (base.id >= nextId) nextId = base.id + 1;
	return { ...base, nextTrigger: computeNextTrigger(base), revision: ++revision };
}

if (seed === 'populated') {
	alarms = [
		makeAlarm({
			enabled: true,
			mode: 'FIXED' as AlarmInput['mode'],
			fixedTime: '07:00',
			label: 'Weekday wake-up',
			activeDays: [1, 2, 3, 4, 5],
		}),
		makeAlarm({
			enabled: true,
			mode: 'WINDOW' as AlarmInput['mode'],
			windowStart: '08:00',
			windowEnd: '08:30',
			label: 'Gentle weekend start',
			activeDays: [0, 6],
		}),
	];
}

function broadcast() {
	// Let the invoke promise resolve first, then fan out the same event Rust would emit.
	setTimeout(() => {
		void emit('alarms:batch:updated', { revision });
	}, 0);
}

// --- IPC handler ---------------------------------------------------------------------------------

const seen = new Set<string>();

mockIPC(
	(cmd, args) => {
		const a = (args ?? {}) as Record<string, any>;
		switch (cmd) {
			// Alarm CRUD (AlarmService)
			case 'get_alarms':
				return alarms;
			case 'get_alarm':
				return alarms.find((x) => x.id === a.id) ?? null;
			case 'save_alarm': {
				const saved = makeAlarm(a.alarm as AlarmInput);
				const idx = alarms.findIndex((x) => x.id === saved.id);
				if (idx >= 0) alarms[idx] = saved;
				else alarms.push(saved);
				broadcast();
				return saved;
			}
			case 'toggle_alarm': {
				const idx = alarms.findIndex((x) => x.id === a.id);
				if (idx < 0) return null;
				const next = { ...alarms[idx], enabled: Boolean(a.enabled) };
				alarms[idx] = { ...next, nextTrigger: computeNextTrigger(next), revision: ++revision };
				broadcast();
				return alarms[idx];
			}
			case 'delete_alarm':
				alarms = alarms.filter((x) => x.id !== a.id);
				broadcast();
				return null;

			// App boot / settings sync (App.tsx, SettingsService, ThemeContext)
			case 'set_time_format':
			case 'set_snooze_length':
			case 'mark_alarm_pipeline_ready':
			case 'set_widget_theme':
			case 'request_alarm_sync':
			case 'dismiss_alarm':
			case 'snooze_alarm':
			case 'report_alarm_fired':
				return null;

			// Window plugin (App.tsx showWindow, TitleBar)
			case 'plugin:window|is_visible':
			case 'plugin:window|is_minimizable':
				return true;
			case 'plugin:window|is_maximized':
			case 'plugin:window|is_maximizable':
			case 'plugin:window|is_resizable':
			case 'plugin:window|is_always_on_top':
				return false;
			case 'plugin:window|set_decorations':
			case 'plugin:window|show':
			case 'plugin:window|set_focus':
				return null;

			// Deep links (DeepLinkService)
			case 'plugin:deep-link|get_current':
				return null;
			case 'plugin:alarm-manager|get_currently_ringing_alarm':
				return { id: null };

			// Android-only boot path (App.tsx, ThemeContext, TimeFormatPrefs, AnimationScale,
			// PredictiveBackController, AlarmNotificationService, Settings permission checks)
			case 'plugin:notification|is_permission_granted':
				return true;
			case 'plugin:notification|register_action_types':
			case 'plugin:notification|cancel':
			case 'plugin:notification|remove_active':
			case 'plugin:notification|create_channel':
			case 'plugin:notification|delete_channel':
			case 'plugin:notification|notify':
			case 'plugin:notification|batch':
				return null;
			case 'plugin:notification|get_pending':
			case 'plugin:notification|get_active':
			case 'plugin:notification|listChannels':
				return [];
			case 'plugin:os-prefs|get_time_format':
				// Android phones commonly report the 12-hour clock; desktop keeps Intl detection.
				return { is24Hour: false };
			case 'plugin:os-prefs|get_animator_duration_scale':
				return { scale: 1 };
			case 'plugin:theme-utils|get_material_you_colours':
				// Pre-Android-12 style response: falls back to the Deep Night brand theme.
				return { supported: false, apiLevel: 30, palettes: {} };
			case 'plugin:predictive-back|set_can_go_back':
			case 'plugin:window|minimize':
				return null;
			case 'plugin:wear-sync|get_native_fan_out_enabled':
				return { enabled: true };
			case 'plugin:alarm-manager|check_full_screen_intent_permission':
			case 'plugin:alarm-manager|check_exact_alarm_permission':
			case 'plugin:alarm-manager|check_battery_optimization_exemption':
				return { granted: true };

			// Event plugin calls not covered by shouldMockEvents
			case 'plugin:event|emit_to':
				return null;

			default:
				if (!seen.has(cmd)) {
					seen.add(cmd);
					console.warn(`[harness] unmocked command: ${cmd}`, args);
				}
				return null;
		}
	},
	{ shouldMockEvents: true },
);

console.log(`[harness] Tauri IPC mocked (seed=${seed}, ${alarms.length} alarms)`);
