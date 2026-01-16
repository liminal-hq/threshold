import React from 'react';

// Check icon for "Always on Top" toggle
const CheckIcon = ({ size = 16 }: { size?: number }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
);

// Move icon for window dragging
const MoveIcon = ({ size = 16 }: { size?: number }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <polyline points="5 9 2 12 5 15"></polyline>
        <polyline points="9 5 12 2 15 5"></polyline>
        <polyline points="15 19 12 22 9 19"></polyline>
        <polyline points="19 9 22 12 19 15"></polyline>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <line x1="12" y1="2" x2="12" y2="22"></line>
    </svg>
);

// Wrapper components with size prop for consistency
const SizedWindowMinimizeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 8H13" stroke="currentColor" strokeWidth="1.5" />
    </svg>
);

const SizedWindowMaximizeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2.5" y="2.5" width="11" height="11" stroke="currentColor" strokeWidth="1.5" />
    </svg>
);

const SizedWindowRestoreIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4.5" y="1.5" width="10" height="10" stroke="currentColor" strokeWidth="1.5" />
        <path d="M1.5 4.5H11.5V14.5H1.5V4.5Z" fill="transparent" stroke="currentColor" strokeWidth="1.5" />
    </svg>
);

const SizedWindowCloseIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 3L13 13" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13 3L3 13" stroke="currentColor" strokeWidth="1.5" />
    </svg>
);

export function getIconByName(name?: string): React.ReactNode {
    if (!name) return null;

    switch (name) {
        case 'WindowRestoreIcon':
            return <SizedWindowRestoreIcon />;
        case 'WindowMaximizeIcon':
            return <SizedWindowMaximizeIcon />;
        case 'WindowMinimizeIcon':
            return <SizedWindowMinimizeIcon />;
        case 'WindowCloseIcon':
            return <SizedWindowCloseIcon />;
        case 'CheckIcon':
            return <CheckIcon size={16} />;
        case 'MoveIcon':
            return <MoveIcon size={16} />;
        default:
            return null;
    }
}
