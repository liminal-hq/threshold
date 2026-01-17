import React from 'react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';

interface DaySelectorProps {
	selectedDays: number[];
	onChange: (days: number[]) => void;
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const DaySelector: React.FC<DaySelectorProps> = ({ selectedDays, onChange }) => {
	const handleFormat = (
		_event: React.MouseEvent<HTMLElement>,
		newFormats: number[],
	) => {
		onChange(newFormats.sort((a, b) => a - b));
	};

	return (
		<ToggleButtonGroup
			value={selectedDays}
			onChange={handleFormat}
			aria-label="active days"
			fullWidth
			size="small"
			sx={{ mt: 1, mb: 1 }}
		>
			{DAYS.map((label, index) => (
				<ToggleButton
                    value={index}
                    key={index}
                    aria-label={label}
                    sx={{
                        border: '1px solid rgba(0, 0, 0, 0.12)',
                        '&.Mui-selected': {
                            backgroundColor: 'primary.main',
                            color: 'primary.contrastText',
                            '&:hover': {
                                backgroundColor: 'primary.dark',
                            }
                        }
                    }}
                >
					{label}
				</ToggleButton>
			))}
		</ToggleButtonGroup>
	);
};
