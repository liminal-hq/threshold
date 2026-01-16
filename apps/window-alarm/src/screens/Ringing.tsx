import React, { useEffect, useState } from 'react';
import { IonContent, IonPage, IonButton } from '@ionic/react';
import { useParams, useHistory } from 'react-router-dom';
import { alarmManagerService } from '../services/AlarmManagerService';
import { Alarm } from '../services/DatabaseService';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import '../theme/ringing.css';
import { TimeFormatHelper } from '../utils/TimeFormatHelper';

const Ringing: React.FC = () => {
	const { id } = useParams<{ id: string }>();
	const [alarm, setAlarm] = useState<Alarm | null>(null);
	const [timeStr, setTimeStr] = useState<string>('');
	const history = useHistory();

	useEffect(() => {
		const loadAlarm = async () => {
			const alarms = await alarmManagerService.loadAlarms();
			const found = alarms.find((a) => a.id === parseInt(id));
			if (found) {
				setAlarm(found);
			}
		};
		loadAlarm();

		// Update clock every second
		const updateTime = () => {
			const now = new Date();
			setTimeStr(TimeFormatHelper.format(now.getTime(), true)); // Force 24h for now, or fetch settings
		};
		updateTime();
		const interval = setInterval(updateTime, 1000);
		return () => clearInterval(interval);
	}, [id]);

	const handleDismiss = async () => {
		if (alarm) {
			await alarmManagerService.saveAndSchedule(alarm);
		}

		// Check platform and close window if desktop
		const os = platform();
		if (os !== 'ios' && os !== 'android') {
			try {
				await getCurrentWindow().close();
			} catch (e) {
				console.error('Failed to close window', e);
				history.replace('/home');
			}
		} else {
			history.replace('/home');
		}
	};

	const handleSnooze = () => {
		console.log('Snoozed Alarm', id);
		// Implement snooze logic properly later
		handleDismiss();
	};

	return (
		<IonPage className="ringing-page">
			<IonContent>
				<div className="ringing-container" data-tauri-drag-region="true">
					<div className="ringing-time">{timeStr}</div>
					<div className="ringing-label">{alarm?.label || 'Wake Up!'}</div>

					<div className="ringing-actions">
						<IonButton className="dismiss-btn" onClick={handleDismiss}>
							Stop Alarm
						</IonButton>
						<IonButton fill="outline" className="snooze-btn" onClick={handleSnooze}>
							Snooze (10m)
						</IonButton>
					</div>
				</div>
			</IonContent>
		</IonPage>
	);
};

export default Ringing;
