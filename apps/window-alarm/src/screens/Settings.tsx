import React, { useState } from 'react';
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
import { SettingsService, Theme } from '../services/SettingsService';

const Settings: React.FC = () => {
	const history = useHistory();
	const [theme, setTheme] = useState<Theme>(SettingsService.getTheme());
	const [is24h, setIs24h] = useState<boolean>(SettingsService.getIs24h());

	const handleThemeChange = (newTheme: Theme) => {
		setTheme(newTheme);
		SettingsService.setTheme(newTheme);
	};

	const handleTimeFormatChange = (enabled: boolean) => {
		setIs24h(enabled);
		SettingsService.setIs24h(enabled);
	};

	return (
		<IonPage>
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
			<IonContent>
				<IonList inset>
					<IonItem>
						<IonLabel>Theme</IonLabel>
						<IonSelect
							value={theme}
							onIonChange={(e) => handleThemeChange(e.detail.value)}
							interface="popover"
						>
							<IonSelectOption value="deep-night">Deep Night (Default)</IonSelectOption>
							<IonSelectOption value="canadian-cottage">Canadian Cottage Winter</IonSelectOption>
						</IonSelect>
					</IonItem>

					<IonItem>
						<IonLabel>Use 24-Hour Time</IonLabel>
						<IonToggle
							checked={is24h}
							onIonChange={(e) => handleTimeFormatChange(e.detail.checked)}
						/>
					</IonItem>
				</IonList>
			</IonContent>
		</IonPage>
	);
};

export default Settings;
