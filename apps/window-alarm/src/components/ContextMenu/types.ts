/**
 * Single menu item
 */
export interface MenuItem {
	id: string;
	label: string;
	icon?: string;
	shortcut?: string;
	disabled?: boolean;
	action?: () => void;
}

/**
 * Separator between menu items
 */
export interface MenuSeparator {
	type: 'separator';
}

/**
 * Menu section with optional title
 */
export interface MenuSection {
	title?: string;
	items: (MenuItem | MenuSeparator)[];
}

/**
 * Complete menu model
 */
export interface MenuModel {
	sections: MenuSection[];
}

/**
 * Menu positioning
 */
export interface MenuPosition {
	x: number;
	y: number;
}
