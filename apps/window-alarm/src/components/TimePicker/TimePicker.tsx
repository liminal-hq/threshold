import React, { useEffect, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { add, remove } from 'ionicons/icons';
import './TimePicker.css';

interface TimePickerProps {
    value: string; // "HH:mm" (24h format)
    onChange: (value: string) => void;
    is24h: boolean;
}

export const TimePicker: React.FC<TimePickerProps> = ({ value, onChange, is24h }) => {
    const [hour, setHour] = useState(0);
    const [minute, setMinute] = useState(0);

    useEffect(() => {
        if (value) {
            const [h, m] = value.split(':').map(Number);
            if (!isNaN(h) && !isNaN(m)) {
                setHour(h);
                setMinute(m);
            }
        }
    }, [value]);

    const updateTime = (newH: number, newM: number) => {
        // Normalize
        let h = newH;
        let m = newM;

        if (m >= 60) {
            m = 0;
            h += 1;
        } else if (m < 0) {
            m = 59;
            h -= 1;
        }

        if (h >= 24) h = 0;
        if (h < 0) h = 23;

        const hh = h.toString().padStart(2, '0');
        const mm = m.toString().padStart(2, '0');
        onChange(`${hh}:${mm}`);
    };

    const adjustHour = (delta: number) => {
        updateTime(hour + delta, minute);
    };

    const adjustMinute = (delta: number) => {
        updateTime(hour, minute + delta);
    };

    // Formatted values for display
    const displayHour = is24h ? hour : hour % 12 || 12;
    const isPm = hour >= 12;

    const toggleAmPm = () => {
        if (is24h) return;
        if (isPm) {
            // Switch to AM: 13 -> 1, 12 -> 0
            updateTime(hour - 12, minute);
        } else {
            // Switch to PM: 1 -> 13, 0 -> 12
            updateTime(hour + 12, minute);
        }
    };

    return (
        <div className="time-picker-container">
            {/* Hours Column */}
            <div className="time-column">
                <button className="time-control-btn" onClick={() => adjustHour(1)}>
                    <IonIcon icon={add} />
                </button>
                <input
                    type="text"
                    className="time-value-input"
                    value={displayHour.toString().padStart(2, '0')}
                    onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) {
                            // Basic clamp/wrap logic can be checking onBlur, 
                            // but for typing we usually allow wide range then normalize.
                            // For simplicity, we just update if it's a number.
                            // But we need to handle the isPm offset logic if !is24h.
                            // Actually, direct edit is tricky with 12h format.
                            // Let's assume user types visual hour.
                            let newH = val;
                            if (!is24h) {
                                if (isPm && newH !== 12) newH += 12;
                                if (!isPm && newH === 12) newH = 0;
                            }
                            updateTime(newH, minute);
                        }
                    }}
                    onBlur={() => {
                        // Ensure valid range
                        updateTime(hour, minute);
                    }}
                />
                <button className="time-control-btn" onClick={() => adjustHour(-1)}>
                    <IonIcon icon={remove} />
                </button>
            </div>

            <div className="time-separator">:</div>

            {/* Minutes Column */}
            <div className="time-column">
                <button className="time-control-btn" onClick={() => adjustMinute(1)}>
                    <IonIcon icon={add} />
                </button>
                <input
                    type="text"
                    className="time-value-input"
                    value={minute.toString().padStart(2, '0')}
                    onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) {
                            updateTime(hour, val);
                        }
                    }}
                    onBlur={() => {
                        updateTime(hour, minute);
                    }}
                />
                <button className="time-control-btn" onClick={() => adjustMinute(-1)}>
                    <IonIcon icon={remove} />
                </button>
            </div>

            {/* AM/PM Column (only if !is24h) */}
            {!is24h && (
                <div className="time-column" style={{ marginLeft: '8px' }}>
                    <button className="time-control-btn" style={{ visibility: 'hidden' }} />
                    <div className="ampm-toggle">
                        <button
                            className={`ampm-btn ${!isPm ? 'selected' : ''}`}
                            onClick={() => isPm && toggleAmPm()}
                        >
                            AM
                        </button>
                        <button
                            className={`ampm-btn ${isPm ? 'selected' : ''}`}
                            onClick={() => !isPm && toggleAmPm()}
                        >
                            PM
                        </button>
                    </div>
                    <button className="time-control-btn" style={{ visibility: 'hidden' }} />
                </div>
            )}
        </div>
    );
};
