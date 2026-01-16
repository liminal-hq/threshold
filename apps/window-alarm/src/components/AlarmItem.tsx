import React from 'react';
import { IonItem, IonLabel, IonNote, IonToggle, IonItemSliding, IonItemOptions, IonItemOption, IonIcon } from '@ionic/react';
import { trash } from 'ionicons/icons';
import { Alarm } from '../services/DatabaseService';
import { format } from 'date-fns';
import { TimeFormatHelper } from '../utils/TimeFormatHelper';

interface AlarmItemProps {
  alarm: Alarm;
  is24h: boolean;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  onClick: () => void;
}

export const AlarmItem: React.FC<AlarmItemProps> = ({ alarm, is24h, onToggle, onDelete, onClick }) => {

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '--:--';
    return TimeFormatHelper.formatTimeString(timeStr, is24h);
  };

  const timeDisplay = alarm.mode === 'FIXED'
    ? formatTime(alarm.fixedTime)
    : `${formatTime(alarm.windowStart)} - ${formatTime(alarm.windowEnd)}`;

  const nextTriggerDisplay = alarm.enabled && alarm.nextTrigger
    ? `Next: ${TimeFormatHelper.format(alarm.nextTrigger, is24h)}` // We might want Day name here too
    : 'Disabled';

  // Enhanced Next Trigger with day
  const nextTriggerDetailed = alarm.enabled && alarm.nextTrigger
    ? `Next: ${format(new Date(alarm.nextTrigger), 'EEE')} ${TimeFormatHelper.format(alarm.nextTrigger, is24h)}`
    : 'Disabled';


  return (
    <IonItemSliding>
      <IonItem button onClick={onClick} detail={false}>
        <IonLabel>
          <h2>{timeDisplay}</h2>
          <p>{alarm.label || 'Alarm'} • <IonNote>{nextTriggerDetailed}</IonNote></p>
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
