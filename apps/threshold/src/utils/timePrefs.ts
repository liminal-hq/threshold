import { invoke } from '@tauri-apps/api/core';
import { PlatformUtils } from './PlatformUtils';

interface TimeFormatResponse {
    is24Hour: boolean;
}

export const TimePrefs = {
    getSystemTimeFormat: async (): Promise<{ is24Hour: boolean; source: 'android' | 'ios' | 'intl' }> => {
        if (PlatformUtils.isMobile()) {
            try {
                // plugin:time-prefs matches the name in lib.rs Builder::new("time-prefs")
                // get_time_format matches the function name in commands.rs
                const response = await invoke<TimeFormatResponse>('plugin:time-prefs|get_time_format');
                const os = PlatformUtils.getPlatform();
                return {
                    is24Hour: response.is24Hour,
                    source: (os === 'android' || os === 'ios') ? os : 'android' // fallback type safety
                };
            } catch (e) {
                console.warn('Failed to get system time format from plugin, falling back to Intl:', e);
            }
        }

        // Desktop / Fallback
        const inferred = TimePrefs.inferredHourPreference();
        return {
            is24Hour: inferred === '24',
            source: 'intl'
        };
    },

    inferredHourPreference: (): "12" | "24" | "unknown" => {
         const opts = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions() as any;

         const hc = opts.hourCycle as string | undefined;
         if (hc === "h23" || hc === "h24") return "24";
         if (hc === "h11" || hc === "h12") return "12";

         const h12 = opts.hour12 as boolean | undefined;
         if (typeof h12 === "boolean") return h12 ? "12" : "24";

         // Default to 12 hour time as requested if unknown
         return "12";
    }
};
