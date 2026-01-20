import React, { useState, useEffect } from 'react';
import {
	IonContent,
	IonHeader,
	IonPage,
	IonTitle,
	IonToolbar,
	IonList,
	IonItem,
	IonLabel,
	IonSelect,
	IonSelectOption,
	IonToggle,
	IonButtons,
	IonButton,
	IonIcon,
} from '@ionic/react';
import { arrowBack } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { platform } from '@tauri-apps/plugin-os';
import { SettingsService, Theme } from '../services/SettingsService';

const Settings: React.FC = () => {
	const history = useHistory();
	const [theme, setTheme] = useState<Theme>(SettingsService.getTheme());
	const [forceDark, setForceDark] = useState<boolean>(SettingsService.getForceDark());
	const [is24h, setIs24h] = useState<boolean>(SettingsService.getIs24h());
	const [useMaterialYou, setUseMaterialYou] = useState<boolean>(SettingsService.getUseMaterialYou());
	const [isMobile, setIsMobile] = useState(false);
	const [isAndroid, setIsAndroid] = useState(false);

	useEffect(() => {
		const os = platform();
		setIsMobile(os === 'ios' || os === 'android');
		setIsAndroid(os === 'android');
	}, []);

	const handleThemeChange = (newTheme: Theme) => {
		setTheme(newTheme);
		SettingsService.setTheme(newTheme);
	};

	const handleForceDarkChange = (enabled: boolean) => {
		setForceDark(enabled);
		SettingsService.setForceDark(enabled);
	};

	const handleTimeFormatChange = (enabled: boolean) => {
		setIs24h(enabled);
		SettingsService.setIs24h(enabled);
	};

	const handleMaterialYouChange = (enabled: boolean) => {
		setUseMaterialYou(enabled);
		SettingsService.setUseMaterialYou(enabled);
	};

	const renderThemeSelect = () => (
		<IonSelect
			value={theme}
			onIonChange={(e) => handleThemeChange(e.detail.value)}
			interface="popover"
		>
			<IonSelectOption value="system">System</IonSelectOption>
			<IonSelectOption value="deep-night">Deep Night (Default)</IonSelectOption>
			<IonSelectOption value="canadian-cottage">Canadian Cottage Winter</IonSelectOption>
			<IonSelectOption value="georgian-bay-plunge">Georgian Bay Plunge</IonSelectOption>
			<IonSelectOption value="boring-light">Boring Light</IonSelectOption>
			<IonSelectOption value="boring-dark">Boring Dark</IonSelectOption>
		</IonSelect>
	);

	return (

		<IonPage style={{ paddingTop: isMobile ? '0' : '32px' }}>
			{isMobile && (
				<IonHeader>
					<IonToolbar>
						<IonButtons slot="start">
							<IonButton onClick={() => history.goBack()}>
								<IonIcon icon={arrowBack} />
							</IonButton>
						</IonButtons>
						<IonTitle>Settings</IonTitle>
					</IonToolbar>
				</IonHeader>
			)}
			<IonContent style={{ '--background': 'var(--ion-background-color)' }}>
				{isMobile ? (
					<IonList inset>
						<IonItem>
							<IonLabel>Theme</IonLabel>
							{renderThemeSelect()}
						</IonItem>

						<IonItem disabled={theme !== 'system' || !isAndroid}>
							<IonLabel>Use Material You</IonLabel>
							<IonToggle
								checked={useMaterialYou}
								onIonChange={(e) => handleMaterialYouChange(e.detail.checked)}
							/>
						</IonItem>

						<IonItem>
							<IonLabel>Force Dark Mode</IonLabel>
							<IonToggle
								checked={forceDark}
								onIonChange={(e) => handleForceDarkChange(e.detail.checked)}
							/>
						</IonItem>

						<IonItem>
							<IonLabel>Use 24-Hour Time</IonLabel>
							<IonToggle
								checked={is24h}
								onIonChange={(e) => handleTimeFormatChange(e.detail.checked)}
							/>
						</IonItem>
					</IonList>
				) : (
					<div className="settings-container" style={{
						minHeight: '100%',
						background: 'var(--ion-background-color)',
						position: 'relative',
						zIndex: 10,
						margin: '0 auto', /* Override CSS margin */
						padding: '32px 16px' /* Use padding for spacing */
					}}>
						<div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
							<IonButton fill="clear" onClick={() => history.goBack()} color="medium" style={{ margin: 0 }}>
								<IonIcon icon={arrowBack} slot="icon-only" />
							</IonButton>
							<h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700 }}>Settings</h1>
						</div>

						<div className="settings-section-title">Appearance</div>
						<div className="settings-card">
							<IonList lines="full">
								<IonItem lines="none">
									<IonLabel>
										<h2>Theme</h2>
										<p>Customize the look and feel</p>
									</IonLabel>
									{renderThemeSelect()}
								</IonItem>

								<IonItem lines="none" disabled={theme !== 'system' || !isAndroid}>
									<IonLabel>
										<h2>Use Material You</h2>
										<p>Adapt to your system wallpaper</p>
									</IonLabel>
									<IonToggle
										slot="end"
										checked={useMaterialYou}
										onIonChange={(e) => handleMaterialYouChange(e.detail.checked)}
									/>
								</IonItem>

								<IonItem lines="none">
									<IonLabel>
										<h2>Force Dark Mode</h2>
										<p>Override system colour scheme</p>
									</IonLabel>
									<IonToggle
										slot="end"
										checked={forceDark}
										onIonChange={(e) => handleForceDarkChange(e.detail.checked)}
									/>
								</IonItem>
							</IonList>
						</div>

						<div className="settings-section-title">General</div>
						<div className="settings-card">
							<IonList lines="full">
								<IonItem lines="none">
									<IonLabel>
										<h2>24-Hour Time</h2>
										<p>Use 24-hour format for time display</p>
									</IonLabel>
									<IonToggle
										slot="end"
										checked={is24h}
										onIonChange={(e) => handleTimeFormatChange(e.detail.checked)}
									/>
								</IonItem>
							</IonList>
						</div>
					</div>
				)}
			</IonContent>
		</IonPage>
	);
};

export default Settings;
