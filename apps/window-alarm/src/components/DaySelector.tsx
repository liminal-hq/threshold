import React from 'react';


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
		<div className="day-selector">
			{DAYS.map((label, index) => {
				const isSelected = selectedDays.includes(index);
				return (
					<div
						key={index}
						className={`day-pill ${isSelected ? 'selected' : ''}`}
						onClick={() => toggleDay(index)}
					>
						{label}
					</div>
				);
			})}
		</div>
	);
};
