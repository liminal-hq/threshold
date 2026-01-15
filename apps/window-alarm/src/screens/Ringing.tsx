import React from 'react';
import { IonContent, IonPage, IonButton, IonText } from '@ionic/react';
import { useParams } from 'react-router-dom';
import { alarmManagerService } from '../services/AlarmManagerService';

// This screen is launched when the alarm triggers
const Ringing: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const handleDismiss = () => {
    // In a real implementation, we would call the native plugin to stop the sound
    // and reschedule the next occurrence.
    // For now, we just close the app/activity logic.
    console.log("Dismissed Alarm", id);
    // Logic to reschedule next would be triggered here or in the background service
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
