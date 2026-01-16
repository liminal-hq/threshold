import React from 'react';
import { IonButton, IonButtons } from '@ionic/react';

interface DaySelectorProps {
	selectedDays: number[];
	onChange: (days: number[]) => void;
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sun=0

export const DaySelector: React.FC<DaySelectorProps> = ({ selectedDays, onChange }) => {
	const toggleDay = (index: number) => {
		if (selectedDays.includes(index)) {
			onChange(selectedDays.filter((d) => d !== index));
		} else {
			onChange([...selectedDays, index].sort());
		}
	};

	return (
		<div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
			{DAYS.map((label, index) => {
				const isSelected = selectedDays.includes(index);
				return (
					<IonButton
						key={index}
						fill={isSelected ? 'solid' : 'outline'}
						shape="round"
						size="small"
						onClick={() => toggleDay(index)}
						color={isSelected ? 'secondary' : 'medium'}
					>
						{label}
					</IonButton>
				);
			})}
		</div>
	);
};
