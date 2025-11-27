import React from 'react';
import {
    Box,
    Drawer,
    List,
    ListItemButton,
    ListItemText,
    Toolbar,
    AppBar,
    Typography,
} from '@mui/material';
import { Link, Outlet, useLocation } from 'react-router-dom';

const drawerWidth = 240;

export default function DashboardLayout({ user }) {
    const location = useLocation();
    const path = location.pathname;

    const isAddServer = path === '/' || path === '/add-server';
    const isManageChannels = path.startsWith('/manage-channels') || path.startsWith('/channels/');

    return (
        <Box sx={{ display: 'flex' }}>
            <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
                <Toolbar>
                    <Typography variant="h6" noWrap component="div">
                        Discord Backup Bot
                    </Typography>
                    <Box sx={{ flexGrow: 1 }} />
                    <Typography variant="body2">
                        {user.username}
                    </Typography>
                </Toolbar>
            </AppBar>

            <Drawer
                variant="permanent"
                sx={{
                    width: drawerWidth,
                    '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' },
                }}
            >
                <Toolbar />
                <Box sx={{ overflow: 'auto' }}>
                    <List>
                        <ListItemButton
                            component={Link}
                            to="/add-server"
                            selected={isAddServer}
                        >
                            <ListItemText primary="Add Server" />
                        </ListItemButton>
                        <ListItemButton
                            component={Link}
                            to="/manage-channels"
                            selected={isManageChannels}
                        >
                            <ListItemText primary="Manage Channels" />
                        </ListItemButton>
                    </List>
                </Box>
            </Drawer>

            <Box
                component="main"
                sx={{ flexGrow: 1, p: 3, marginLeft: `${drawerWidth}px` }}
            >
                <Toolbar />
                <Outlet />
            </Box>
        </Box>
    );
}
