import React, { useState, useEffect } from 'react';
import {
	IonContent,
	IonHeader,
	IonPage,
	IonTitle,
	IonToolbar,
	IonFab,
	IonFabButton,
	IonIcon,
	IonList,
	useIonViewWillEnter,
	IonRefresher,
	IonRefresherContent,
	IonButtons,
	IonButton,
} from '@ionic/react';
import { add, ellipsisVertical, settingsOutline } from 'ionicons/icons';
import { platform } from '@tauri-apps/plugin-os';
import { useHistory } from 'react-router-dom';
import { Alarm } from '../services/DatabaseService';
import { alarmManagerService } from '../services/AlarmManagerService';
import { AlarmItem } from '../components/AlarmItem';
import { SettingsService } from '../services/SettingsService';

const Home: React.FC = () => {
	const [alarms, setAlarms] = useState<Alarm[]>([]);
	const [isMobile, setIsMobile] = useState(false);
	const is24h = SettingsService.getIs24h();

	const history = useHistory();

	useEffect(() => {
		// Detect platform (synchronous in Tauri v2)
		const os = platform();
		setIsMobile(os === 'ios' || os === 'android');
	}, []);

	const loadData = async () => {
		await alarmManagerService.init();
		const data = await alarmManagerService.loadAlarms();
		setAlarms(data);
	};

	useIonViewWillEnter(() => {
		loadData();
	});

	const handleToggle = async (alarm: Alarm, enabled: boolean) => {
		await alarmManagerService.toggleAlarm(alarm, enabled);
		loadData();
	};

	const handleDelete = async (id: number) => {
		await alarmManagerService.deleteAlarm(id);
		loadData();
	};

	return (
		<IonPage>
			{isMobile && (
				<IonHeader>
					<IonToolbar>
						<IonTitle>Window Alarm</IonTitle>
						<IonButtons slot="end">
							<IonButton onClick={() => history.push('/settings')}>
								<IonIcon icon={ellipsisVertical} />
							</IonButton>
						</IonButtons>
					</IonToolbar>
				</IonHeader>
			)}
			<IonContent fullscreen>
				<IonRefresher slot="fixed" onIonRefresh={(e) => loadData().then(() => e.detail.complete())}>
					<IonRefresherContent />
				</IonRefresher>

				{/* Desktop settings button */}
				{!isMobile && (
					<div style={{
						position: 'absolute',
						top: '8px',
						right: '16px',
						zIndex: 10
					}}>
						<IonButton fill="clear" onClick={() => history.push('/settings')}>
							<IonIcon icon={settingsOutline} style={{ fontSize: '1.5rem' }} />
						</IonButton>
					</div>
				)}

				<IonList>
					{alarms.map((alarm) => (
						<AlarmItem
							key={alarm.id}
							alarm={alarm}
							is24h={is24h}
							isMobile={isMobile}
							onToggle={(enabled) => handleToggle(alarm, enabled)}
							onDelete={() => handleDelete(alarm.id)}
							onClick={() => history.push(`/edit/${alarm.id}`)}
						/>
					))}
				</IonList>

				<IonFab vertical="bottom" horizontal="end" slot="fixed">
					<IonFabButton color="secondary" onClick={() => history.push('/edit/new')}>
						<IonIcon icon={add} />
					</IonFabButton>
				</IonFab>
			</IonContent>
		</IonPage>
	);
};

export default Home;
