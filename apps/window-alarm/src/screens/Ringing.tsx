import React from 'react';
import { IonContent, IonPage, IonButton, IonText } from '@ionic/react';
import { useParams } from 'react-router-dom';
import { alarmManagerService } from '../services/AlarmManagerService';

// This screen is launched when the alarm triggers
const Ringing: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const handleDismiss = async () => {
    console.log("Dismissed Alarm", id);
    // Reschedule next occurrence
    const alarms = await alarmManagerService.loadAlarms();
    const alarm = alarms.find(a => a.id === parseInt(id));

    if (alarm) {
        // This will calculate next trigger (e.g. tomorrow) and schedule it natively
        await alarmManagerService.saveAndSchedule(alarm);
    }

    // Close window or navigate back
    // In Android full screen intent, we might want to minimize app or close activity
    // For now we just route home
    // history.replace('/home');
    // (Assuming useHistory is imported, but simpler to just let user navigate)
  };

  const handleSnooze = () => {
    console.log("Snoozed Alarm", id);
  };

  return (
    <IonPage>
      <IonContent className="ion-padding" style={{ '--background': '#000', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'white' }}>
            <IonText>
                <h1>7:30</h1>
            </IonText>
            <IonText>
                <h3>Wake Up!</h3>
            </IonText>
        </div>

        <div style={{ paddingBottom: '50px' }}>
            <IonButton expand="block" size="large" color="medium" onClick={handleSnooze}>
                Snooze (10m)
            </IonButton>
            <br />
            <IonButton expand="block" size="large" color="secondary" onClick={handleDismiss}>
                Slide to Stop
            </IonButton>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Ringing;
