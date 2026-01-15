import React from 'react';
import { IonItem, IonLabel, IonNote, IonToggle, IonItemSliding, IonItemOptions, IonItemOption, IonIcon } from '@ionic/react';
import { trash } from 'ionicons/icons';
import { Alarm } from '../services/DatabaseService';
import { format } from 'date-fns';

interface AlarmItemProps {
  alarm: Alarm;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  onClick: () => void;
}

export const AlarmItem: React.FC<AlarmItemProps> = ({ alarm, onToggle, onDelete, onClick }) => {

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '--:--';
    // Check if it's 24h string HH:mm
    const [h, m] = timeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(h), parseInt(m));
    return format(date, 'h:mm a');
  };

  const timeDisplay = alarm.mode === 'FIXED'
    ? formatTime(alarm.fixedTime)
    : `${formatTime(alarm.windowStart)} - ${formatTime(alarm.windowEnd)}`;

  const nextTriggerDisplay = alarm.enabled && alarm.nextTrigger
    ? `Next: ${format(new Date(alarm.nextTrigger), 'EEE h:mm a')}`
    : 'Disabled';

  return (
    <IonItemSliding>
      <IonItem button onClick={onClick} detail={false}>
        <IonLabel>
          <h2>{timeDisplay}</h2>
          <p>{alarm.label || 'Alarm'} • <IonNote>{nextTriggerDisplay}</IonNote></p>
        </IonLabel>
        <IonToggle
          slot="end"
          checked={alarm.enabled}
          onIonChange={e => onToggle(e.detail.checked)}
          onClick={e => e.stopPropagation()}
        />
      </IonItem>

      <IonItemOptions side="end">
        <IonItemOption color="danger" onClick={onDelete}>
          <IonIcon slot="icon-only" icon={trash} />
        </IonItemOption>
      </IonItemOptions>
    </IonItemSliding>
  );
};
