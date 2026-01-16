import { format } from 'date-fns';

export const TimeFormatHelper = {
  format: (date: Date | number | string, is24h: boolean): string => {
    const d = new Date(date);
    return is24h ? format(d, 'HH:mm') : format(d, 'h:mm a');
  },

  // Format specific time string "HH:mm" (from inputs) to display
  formatTimeString: (timeStr: string, is24h: boolean): string => {
    const [h, m] = timeStr.split(':');
    const d = new Date();
    d.setHours(parseInt(h), parseInt(m));
    return is24h ? format(d, 'HH:mm') : format(d, 'h:mm a');
  }
};
