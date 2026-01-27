export { AlarmMode } from '@threshold/core/types';
import { AlarmMode } from '@threshold/core/types';

export interface AlarmRecord {
    id: number;
    label: string | null;
    enabled: boolean;
    mode: AlarmMode;
    fixedTime: string | null;
    windowStart: string | null;
    windowEnd: string | null;
    activeDays: number[];
    nextTrigger: number | null;
    soundUri: string | null;
    soundTitle: string | null;
}

export interface AlarmInput {
    id?: number;
    label?: string | null;
    enabled: boolean;
    mode: AlarmMode;
    fixedTime?: string | null;
    windowStart?: string | null;
    windowEnd?: string | null;
    activeDays: number[];
    soundUri?: string | null;
    soundTitle?: string | null;
}
