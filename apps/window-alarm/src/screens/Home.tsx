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
	IonFooter,
} from '@ionic/react';
import { add, ellipsisVertical, settingsOutline } from 'ionicons/icons';
import { platform } from '@tauri-apps/plugin-os';
import { useHistory, useLocation } from 'react-router-dom';
import { Alarm } from '../services/DatabaseService';
import { alarmManagerService } from '../services/AlarmManagerService';
import { AlarmItem } from '../components/AlarmItem';
import { SettingsService } from '../services/SettingsService';

const Home: React.FC = () => {
	const history = useHistory();
	const location = useLocation();
	const [alarms, setAlarms] = useState<Alarm[]>([]);
	const [isMobile, setIsMobile] = useState(false);
	const is24h = SettingsService.getIs24h();

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

	const handleEdit = (id: number) => {
		history.push(`/edit/${id}`);
	};

	const handleAdd = () => {
		history.push('/edit/new');
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

				{/* Desktop settings button - Only show if on home and not transitioning away (approximated by route check) */}
				{!isMobile && location.pathname === '/home' && (
					<div style={{
						position: 'fixed',
						top: '48px', /* 32px titlebar + 16px margin */
						right: '16px',
						zIndex: 1000
					}}>
						<IonButton fill="clear" onClick={() => history.push('/settings')}>
							<IonIcon icon={settingsOutline} style={{ fontSize: '1.5rem', color: 'var(--ion-text-color)' }} />
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
							onClick={() => handleEdit(alarm.id)}
						/>
					))}
				</IonList>

				{/* Floating Add Button for Mobile/Desktop - Only show on Home */}
				{location.pathname === '/home' && (
					<div className={!isMobile ? "desktop-footer" : "mobile-fab-container"} style={!isMobile ? {
						position: 'fixed',
						bottom: 0,
						left: 0,
						right: 0,
						zIndex: 1000 /* Ensure above content */
					} : {}}>
						{!isMobile ? (
							<IonButton expand="block" color="secondary" onClick={handleAdd} style={{ width: '100%', maxWidth: '400px', margin: '0 auto', height: '48px' }}>
								<IonIcon icon={add} slot="start" />
								Add Alarm
							</IonButton>
						) : (
							<IonFab vertical="bottom" horizontal="end" slot="fixed">
								<IonFabButton color="secondary" onClick={handleAdd}>
									<IonIcon icon={add} />
								</IonFabButton>
							</IonFab>
						)}
					</div>
				)}
			</IonContent>
		</IonPage >
	);
};

export default Home;
