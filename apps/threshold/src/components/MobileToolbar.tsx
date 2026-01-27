import React, { useState } from 'react';
import {
    AppBar,
    Toolbar,
    Typography,
    IconButton,
    Menu,
    MenuItem,
    Box
} from '@mui/material';
import { MoreVert as MoreVertIcon } from '@mui/icons-material';

interface MobileToolbarProps {
    title: React.ReactNode;
    startAction?: React.ReactNode;
    endAction?: React.ReactNode;
    menuItems?: {
        label: string;
        onClick: () => void;
    }[];
}

export const MobileToolbar: React.FC<MobileToolbarProps> = ({
    title,
    startAction,
    endAction,
    menuItems
}) => {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    const handleMenuClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
    };

    const handleMenuItemClick = (onClick: () => void) => {
        handleMenuClose();
        onClick();
    };

    return (
        <AppBar position="sticky" elevation={0} sx={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <Toolbar>
                {startAction && (
                    <Box sx={{ mr: 2 }}>
                        {startAction}
                    </Box>
                )}
                
                <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                    {title}
                </Typography>

                {endAction}

                {menuItems && menuItems.length > 0 && (
                    <>
                        <IconButton
                            id="mobile-menu-button"
                            color="inherit"
                            onClick={handleMenuClick}
                            aria-controls={open ? 'mobile-menu' : undefined}
                            aria-haspopup="true"
                            aria-expanded={open ? 'true' : undefined}
                        >
                            <MoreVertIcon />
                        </IconButton>
                        <Menu
                            id="mobile-menu"
                            anchorEl={anchorEl}
                            open={open}
                            onClose={handleMenuClose}
                            MenuListProps={{
                                'aria-labelledby': 'mobile-menu-button',
                            }}
                        >
                            {menuItems.map((item, index) => (
                                <MenuItem 
                                    key={index} 
                                    onClick={() => handleMenuItemClick(item.onClick)}
                                >
                                    {item.label}
                                </MenuItem>
                            ))}
                        </Menu>
                    </>
                )}
            </Toolbar>
        </AppBar>
    );
};
