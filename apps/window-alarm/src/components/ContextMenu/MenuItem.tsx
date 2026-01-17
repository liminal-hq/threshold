import React from 'react';
import type { MenuItem as MenuItemType } from './types';
import { getIconByName } from './iconMapper';

interface MenuItemProps {
    item: MenuItemType;
    onItemClick: (id: string, action?: () => void) => void;
}

export function MenuItem({ item, onItemClick }: MenuItemProps) {
    function handleClick(e: React.MouseEvent) {
        if (item.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        onItemClick(item.id, item.action);
    }

    const iconNode = getIconByName(item.icon);

    return (
        <button
            className={`menu-item ${item.disabled ? 'disabled' : ''}`}
            onClick={handleClick}
            disabled={item.disabled}
            role="menuitem"
        >
            <span className="menu-item-icon">{iconNode}</span>
            <span className="menu-item-label">{item.label}</span>
            {item.shortcut && <span className="menu-item-shortcut">{item.shortcut}</span>}
        </button>
    );
}
