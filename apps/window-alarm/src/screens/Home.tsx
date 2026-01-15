import React, { useEffect, useState } from 'react';
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonFab, IonFabButton, IonIcon, IonList, useIonViewWillEnter, IonRefresher, IonRefresherContent } from '@ionic/react';
import { add } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { Alarm, databaseService } from '../services/DatabaseService';
import { alarmManagerService } from '../services/AlarmManagerService';
import { AlarmItem } from '../components/AlarmItem';

const Home: React.FC = () => {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
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
