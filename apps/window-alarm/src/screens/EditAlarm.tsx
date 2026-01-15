import React, { useEffect, useState } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonButtons, IonButton,
  IonItem, IonLabel, IonInput, IonSegment, IonSegmentButton, IonDatetime,
  IonList, IonNote
} from '@ionic/react';
import { useHistory, useParams } from 'react-router-dom';
import { Alarm, databaseService } from '../services/DatabaseService';
import { alarmManagerService } from '../services/AlarmManagerService';
import { DaySelector } from '../components/DaySelector';

const EditAlarm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const isNew = id === 'new';

  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<'FIXED' | 'WINDOW'>('FIXED');
  const [activeDays, setActiveDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
  const [fixedTime, setFixedTime] = useState('07:00');
  const [windowStart, setWindowStart] = useState('07:00');
  const [windowEnd, setWindowEnd] = useState('07:30');

  useEffect(() => {
    if (!isNew) {
      loadAlarm(parseInt(id));
    }
  }, [id]);

  const loadAlarm = async (alarmId: number) => {
    const alarms = await databaseService.getAllAlarms();
    const alarm = alarms.find(a => a.id === alarmId);
    if (alarm) {
      setLabel(alarm.label);
      setMode(alarm.mode);
      setActiveDays(alarm.activeDays);
      if (alarm.fixedTime) setFixedTime(alarm.fixedTime);
      if (alarm.windowStart) setWindowStart(alarm.windowStart);
      if (alarm.windowEnd) setWindowEnd(alarm.windowEnd);
    }
  };

  const handleSave = async () => {
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

    await alarmManagerService.saveAndSchedule(alarmData);
    history.goBack();
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={() => history.goBack()}>Cancel</IonButton>
          </IonButtons>
          <IonTitle>{isNew ? 'New Alarm' : 'Edit Alarm'}</IonTitle>
          <IonButtons slot="end">
            <IonButton strong color="secondary" onClick={handleSave}>Save</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList inset>
            <IonSegment value={mode} onIonChange={e => setMode(e.detail.value as any)}>
                <IonSegmentButton value="FIXED">
                    <IonLabel>Fixed Time</IonLabel>
                </IonSegmentButton>
                <IonSegmentButton value="WINDOW">
                    <IonLabel>Random Window</IonLabel>
                </IonSegmentButton>
            </IonSegment>

            {mode === 'FIXED' ? (
                <IonItem>
                    <IonLabel position="stacked">Time</IonLabel>
                    <IonDatetime
                        presentation="time"
                        value={fixedTime}
                        onIonChange={e => setFixedTime(Array.isArray(e.detail.value) ? e.detail.value[0] : e.detail.value!)}
                    />
                </IonItem>
            ) : (
                <>
                    <IonItem>
                        <IonLabel>Start Window</IonLabel>
                        <IonDatetime
                            presentation="time"
                            value={windowStart}
                            onIonChange={e => setWindowStart(Array.isArray(e.detail.value) ? e.detail.value[0] : e.detail.value!)}
                        />
                    </IonItem>
                    <IonItem>
                        <IonLabel>End Window</IonLabel>
                        <IonDatetime
                            presentation="time"
                            value={windowEnd}
                            onIonChange={e => setWindowEnd(Array.isArray(e.detail.value) ? e.detail.value[0] : e.detail.value!)}
                        />
                    </IonItem>
                    <IonItem lines="none">
                        <IonNote>Alarm will ring once randomly between these times.</IonNote>
                    </IonItem>
                </>
            )}

            <IonItem>
                <IonLabel position="stacked">Label</IonLabel>
                <IonInput
                    placeholder="Wake up"
                    value={label}
                    onIonChange={e => setLabel(e.detail.value!)}
                />
            </IonItem>

            <IonItem lines="none">
                <IonLabel position="stacked">Repeats</IonLabel>
                <DaySelector selectedDays={activeDays} onChange={setActiveDays} />
            </IonItem>
        </IonList>
      </IonContent>
    </IonPage>
  );
};

export default EditAlarm;
