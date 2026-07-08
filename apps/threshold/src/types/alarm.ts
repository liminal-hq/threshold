// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: apps/threshold/src-tauri/src/alarm/models.rs
// Regenerate with: UPDATE_TS_BINDINGS=1 cargo test -p threshold ts_bindings -- --nocapture

import { AlarmMode } from '@threshold/core/types';
export { AlarmMode };

/**
 * Complete alarm configuration (returned to TypeScript)
 */
export type AlarmRecord = {
	id: number;
	label: string | null;
	enabled: boolean;
	mode: AlarmMode;
	fixedTime: string | null;
	windowStart: string | null;
	windowEnd: string | null;
	activeDays: Array<number>;
	nextTrigger: number | null;
	soundUri: string | null;
	soundTitle: string | null;
	revision: number;
};

/**
 * Input for creating/updating alarms (from TypeScript)
 */
export type AlarmInput = {
	id?: number | null;
	label?: string | null;
	enabled: boolean;
	mode: AlarmMode;
	fixedTime?: string | null;
	windowStart?: string | null;
	windowEnd?: string | null;
	activeDays: Array<number>;
	soundUri?: string | null;
	soundTitle?: string | null;
};
