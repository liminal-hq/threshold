import React, { useEffect, useState } from 'react';
import {
	IonContent,
	IonHeader,
	IonPage,
	IonTitle,
	IonToolbar,
	IonButtons,
	IonButton,
	IonItem,
	IonLabel,
	IonInput,
	IonSegment,
	IonSegmentButton,
	IonDatetime,
	IonList,
	IonNote,
} from '@ionic/react';
import { useHistory, useParams } from 'react-router-dom';
import { platform } from '@tauri-apps/plugin-os';
import { databaseService } from '../services/DatabaseService';
import { alarmManagerService } from '../services/AlarmManagerService';
import { DaySelector } from '../components/DaySelector';
import { SettingsService } from '../services/SettingsService';
import { TimePicker } from '../components/TimePicker';

const EditAlarm: React.FC = () => {
	const { id } = useParams<{ id: string }>();
	const history = useHistory();
	const isNew = id === 'new';
	const is24h = SettingsService.getIs24h();
	const [isMobile, setIsMobile] = useState(false);

	const [label, setLabel] = useState('');
	const [mode, setMode] = useState<'FIXED' | 'WINDOW'>('FIXED');
	const [activeDays, setActiveDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
	const [fixedTime, setFixedTime] = useState('07:00');
	const [windowStart, setWindowStart] = useState('07:00');
	const [windowEnd, setWindowEnd] = useState('07:30');

	useEffect(() => {
		const os = platform();
		setIsMobile(os === 'ios' || os === 'android');
	}, []);

	useEffect(() => {
		if (!isNew) {
			loadAlarm(parseInt(id));
		}
	}, [id]);

	const loadAlarm = async (alarmId: number) => {
		const alarms = await databaseService.getAllAlarms();
		const alarm = alarms.find((a) => a.id === alarmId);
		if (alarm) {
			setLabel(alarm.label || '');
			setMode(alarm.mode);
			setActiveDays(alarm.activeDays);
			if (alarm.fixedTime) setFixedTime(alarm.fixedTime);
			if (alarm.windowStart) setWindowStart(alarm.windowStart);
			if (alarm.windowEnd) setWindowEnd(alarm.windowEnd);
		}
	};

	const handleSave = async () => {
		console.log('[EditAlarm] handleSave called. Mode:', mode, 'Fixed:', fixedTime);
		if (activeDays.length === 0) {
			alert('Please select at least one day for the alarm to repeat.');
			return;
		}

		const alarmData: any = {
			label,
			mode,
			activeDays,
			enabled: true, // Auto-enable on save
		};

		if (mode === 'FIXED') {
			alarmData.fixedTime = fixedTime;
		} else {
			alarmData.windowStart = windowStart;
			alarmData.windowEnd = windowEnd;
		}

		if (!isNew) {
			alarmData.id = parseInt(id);
		}

		try {
			console.log('[EditAlarm] Calling saveAndSchedule with:', alarmData);
			await alarmManagerService.saveAndSchedule(alarmData);
			console.log('[EditAlarm] Save successful');
			history.goBack();
		} catch (e) {
			console.error('[EditAlarm] SAVE ERROR:', e);
			const msg = e instanceof Error ? e.message : JSON.stringify(e);
			alert(`CRITICAL SAVE ERROR: ${msg}`);
		}
	};

	return (
		<IonPage style={{ paddingTop: isMobile ? '0' : '32px' }}>
			{isMobile && (
				<IonHeader>
					<IonToolbar>
						<IonButtons slot="start">
							<IonButton onClick={() => history.goBack()}>Cancel</IonButton>
						</IonButtons>
						<IonTitle>{isNew ? 'New Alarm' : 'Edit Alarm'}</IonTitle>
						<IonButtons slot="end">
							<IonButton strong color="secondary" onClick={handleSave}>
								Save
							</IonButton>
						</IonButtons>
					</IonToolbar>
				</IonHeader>
			)}
			<IonContent style={{ paddingTop: isMobile ? '0' : '8px' }}>
				{!isMobile && (
					<div style={{ padding: '24px 16px 0 16px' }}>
						<h2 style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>{isNew ? 'New Alarm' : 'Edit Alarm'}</h2>
					</div>
				)}
				<IonList inset={!isMobile} lines={isMobile ? 'full' : 'none'} style={!isMobile ? { marginTop: '24px', background: 'transparent' } : {}}>
					<IonSegment
						value={mode}
						onIonChange={(e) => setMode(e.detail.value as any)}
						className={!isMobile ? "custom-pill" : ""}
						mode={!isMobile ? undefined : "ios"}
					>
						<IonSegmentButton value="FIXED">
							<IonLabel>Fixed Time</IonLabel>
						</IonSegmentButton>
						<IonSegmentButton value="WINDOW">
							<IonLabel>Random Window</IonLabel>
						</IonSegmentButton>
					</IonSegment>

					{mode === 'FIXED' ? (
						<IonItem>
							<IonLabel position={isMobile ? 'stacked' : undefined} style={!isMobile ? { display: 'none' } : {}}>
								Time
							</IonLabel>
							{!isMobile ? (
								<div style={{ width: '100%', padding: '16px 0' }}>
									<TimePicker value={fixedTime} onChange={setFixedTime} is24h={is24h} />
								</div>
							) : (
								<IonDatetime
									presentation="time"
									hourCycle={is24h ? 'h23' : 'h12'}
									value={fixedTime}
									onIonChange={(e) =>
										setFixedTime(Array.isArray(e.detail.value) ? e.detail.value[0] : e.detail.value!)
									}
								/>
							)}
						</IonItem>
					) : (
						<>
							<IonItem>
								<IonLabel position={isMobile ? 'stacked' : undefined} style={!isMobile ? { width: '100%', textAlign: 'center', marginBottom: '8px' } : {}}>
									Start Window
								</IonLabel>
								{!isMobile ? (
									<div style={{ width: '100%', paddingBottom: '16px' }}>
										<TimePicker value={windowStart} onChange={setWindowStart} is24h={is24h} />
									</div>
								) : (
									<IonDatetime
										presentation="time"
										hourCycle={is24h ? 'h23' : 'h12'}
										value={windowStart}
										onIonChange={(e) =>
											setWindowStart(
												Array.isArray(e.detail.value) ? e.detail.value[0] : e.detail.value!,
											)
										}
									/>
								)}
							</IonItem>
							<IonItem>
								<IonLabel position={isMobile ? 'stacked' : undefined} style={!isMobile ? { width: '100%', textAlign: 'center', marginBottom: '8px' } : {}}>
									End Window
								</IonLabel>
								{!isMobile ? (
									<div style={{ width: '100%', paddingBottom: '16px' }}>
										<TimePicker value={windowEnd} onChange={setWindowEnd} is24h={is24h} />
									</div>
								) : (
									<IonDatetime
										presentation="time"
										hourCycle={is24h ? 'h23' : 'h12'}
										value={windowEnd}
										onIonChange={(e) =>
											setWindowEnd(
												Array.isArray(e.detail.value) ? e.detail.value[0] : e.detail.value!,
											)
										}
									/>
								)}
							</IonItem>
							<IonItem lines="none">
								<IonNote>Alarm will ring once randomly between these times.</IonNote>
							</IonItem>
						</>
					)}

					<IonItem lines="none" className="label-input-item">
						<IonLabel position="stacked">Label</IonLabel>
						<div style={{
							border: '1px solid var(--ion-border-color)',
							borderRadius: '8px',
							padding: '0 8px',
							marginTop: '8px',
							background: 'var(--ion-card-background, #fff)'
						}}>
							<IonInput
								placeholder="Alarm Label (e.g. Wake Up)"
								value={label}
								onIonChange={(e) => setLabel(e.detail.value!)}
								clearInput
								style={{ '--background': 'transparent', '--color': 'var(--ion-text-color)' }}
							/>
						</div>
					</IonItem>

					<IonItem lines="none">
						<IonLabel position="stacked">Repeats</IonLabel>
						<DaySelector selectedDays={activeDays} onChange={setActiveDays} />
					</IonItem>
				</IonList>
			</IonContent>

			{!isMobile && (
				<div className="desktop-footer">
					<IonButton fill="clear" onClick={() => history.goBack()}>
						Cancel
					</IonButton>
					<IonButton strong color="secondary" onClick={handleSave}>
						Save Alarm
					</IonButton>
				</div>
			)}
		</IonPage>
	);
};

export default EditAlarm;
