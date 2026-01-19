import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { MenuModel, MenuPosition } from './types';
import { MenuSection } from './MenuSection';
import './ContextMenu.css';

interface ContextMenuProps {
    model: MenuModel;
    position: MenuPosition;
    onClose: () => void;
    onItemClick: (itemId: string, action?: () => void) => void;
}

export function ContextMenu({ model, position, onClose, onItemClick }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    // Position menu and clamp to viewport
    useEffect(() => {
        if (!menuRef.current) return;

        const menu = menuRef.current;
        const rect = menu.getBoundingClientRect();
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight,
        };

        let { x, y } = position;

        // Clamp horizontally
        if (x + rect.width > viewport.width) {
            x = viewport.width - rect.width - 8;
        }

        // Clamp vertically
        if (y + rect.height > viewport.height) {
            y = viewport.height - rect.height - 8;
        }

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    }, [position]);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        function handleEscape(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                onClose();
            }
        }

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Close on window blur
    useEffect(() => {
        window.addEventListener('blur', onClose);
        return () => window.removeEventListener('blur', onClose);
    }, [onClose]);

    function handleItemClick(itemId: string, action?: () => void) {
        onItemClick(itemId, action);
        onClose();
    }

    return createPortal(
        <div ref={menuRef} className="context-menu" role="menu">
            {model.sections.map((section, idx) => (
                <MenuSection key={idx} section={section} onItemClick={handleItemClick} />
            ))}
        </div>,
        document.body,
    );
}
