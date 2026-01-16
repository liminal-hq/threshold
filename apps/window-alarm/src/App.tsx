import { Redirect, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import Home from './screens/Home';
import EditAlarm from './screens/EditAlarm';
import Ringing from './screens/Ringing';
import Settings from './screens/Settings';
import TitleBar from './components/TitleBar';
import { SettingsService } from './services/SettingsService';
import React, { useEffect } from 'react';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/* Theme variables */
import './theme/variables.css';

import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';

setupIonicReact();

const App: React.FC = () => {
	const [isMobile, setIsMobile] = React.useState(false);

	useEffect(() => {
		// Detect platform (synchronous in Tauri v2)
		const os = platform();
		setIsMobile(os === 'ios' || os === 'android');

		SettingsService.applyTheme();

		const showWindow = async () => {
			try {
				const win = getCurrentWindow();
				const visible = await win.isVisible();
				if (!visible) {
					await win.show();
					await win.setFocus();
				}
			} catch (error: any) {
				console.warn('Failed to show/focus window:', error);
			}
		};
		showWindow();
	}, []);

	return (
		<IonApp>
			{!isMobile && <TitleBar />}
			<div style={{ marginTop: isMobile ? '0px' : '32px', height: isMobile ? '100%' : 'calc(100% - 32px)' }}>
				<IonReactRouter>
					<IonRouterOutlet>
						<Route exact path="/home">
							<Home />
						</Route>
						<Route exact path="/edit/:id">
							<EditAlarm />
						</Route>
						<Route exact path="/ringing/:id">
							<Ringing />
						</Route>
						<Route exact path="/settings">
							<Settings />
						</Route>
						<Route exact path="/">
							<Redirect to="/home" />
						</Route>
					</IonRouterOutlet>
				</IonReactRouter>
			</div>
		</IonApp>
	);
};

export default App;
