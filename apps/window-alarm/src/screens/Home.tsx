import React, { useState } from 'react';
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonFab, IonFabButton, IonIcon, IonList, useIonViewWillEnter, IonRefresher, IonRefresherContent, IonButtons, IonButton } from '@ionic/react';
import { add, ellipsisVertical } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { Alarm, databaseService } from '../services/DatabaseService';
import { alarmManagerService } from '../services/AlarmManagerService';
import { AlarmItem } from '../components/AlarmItem';
import { SettingsService } from '../services/SettingsService';

const Home: React.FC = () => {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  // Store preference locally in component to force re-render on enter if needed,
  // though typically SettingsService is global.
  // For now we just read it during render or map.
  const is24h = SettingsService.getIs24h();

  const history = useHistory();

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
      <IonContent fullscreen>
        <IonRefresher slot="fixed" onIonRefresh={e => loadData().then(() => e.detail.complete())}>
          <IonRefresherContent />
        </IonRefresher>

        <IonList>
          {alarms.map(alarm => (
            <AlarmItem
              key={alarm.id}
              alarm={alarm}
              is24h={is24h}
              onToggle={(enabled) => handleToggle(alarm, enabled)}
              onDelete={() => handleDelete(alarm.id)}
              onClick={() => history.push(\`/edit/\${alarm.id}\`)}
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
