import React from 'react';
import {
	IonItem,
	IonToggle,
	IonItemSliding,
	IonItemOptions,
	IonItemOption,
	IonIcon,
} from '@ionic/react';
import { trash, shuffle, time } from 'ionicons/icons';
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

export const AlarmItem: React.FC<AlarmItemProps & { isMobile?: boolean }> = ({
	alarm,
	is24h,
	onToggle,
	onDelete,
	onClick,
	isMobile = false,
}) => {
	const formatTime = (timeStr?: string) => {
		if (!timeStr) return '--:--';
		return TimeFormatHelper.formatTimeString(timeStr, is24h);
	};

	const timeDisplay =
		alarm.mode === 'FIXED'
			? formatTime(alarm.fixedTime)
			: `${formatTime(alarm.windowStart)} - ${formatTime(alarm.windowEnd)}`;

	const nextTriggerDetailed =
		alarm.enabled && alarm.nextTrigger
			? `${format(new Date(alarm.nextTrigger), 'EEE')} ${TimeFormatHelper.format(alarm.nextTrigger, is24h)}`
			: 'Disabled';

	const CardContent = () => (
		<>
			<div className="alarm-info">
				<div className="alarm-time">{timeDisplay}</div>
				<div className="alarm-label">{alarm.label || 'Alarm'}</div>
				<div className="alarm-next">
					{alarm.enabled && <IonIcon icon={alarm.mode === 'WINDOW' ? shuffle : time} style={{ fontSize: '12px' }} />}
					{nextTriggerDetailed}
				</div>
			</div>
			<div className="alarm-actions" onClick={(e) => e.stopPropagation()}>
				{!isMobile && (
					<button className="delete-btn" onClick={onDelete} title="Delete Alarm">
						<IonIcon icon={trash} size="large" />
					</button>
				)}
				<IonToggle
					checked={alarm.enabled}
					onIonChange={(e) => onToggle(e.detail.checked)}
				/>
			</div>
		</>
	);

	if (isMobile) {
		return (
			<IonItemSliding className="mobile-alarm-wrapper">
				<IonItem
					button
					onClick={onClick}
					detail={false}
					lines="none"
					className="alarm-card mobile-alarm-card"
					style={{ '--padding-start': '0', '--inner-padding-end': '0', background: 'transparent' }}
				>
					<div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0' }}>
						<CardContent />
					</div>
				</IonItem>

				<IonItemOptions side="end">
					<IonItemOption color="danger" onClick={onDelete}>
						<IonIcon slot="icon-only" icon={trash} />
					</IonItemOption>
				</IonItemOptions>
			</IonItemSliding>
		);
	}

	return (
		<div className="alarm-card" onClick={onClick}>
			<CardContent />
		</div>
	);
};
