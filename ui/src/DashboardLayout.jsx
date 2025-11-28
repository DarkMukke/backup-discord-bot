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
    IconButton,
} from '@mui/material';
import { Link, Outlet } from 'react-router-dom';
import MenuIcon from '@mui/icons-material/Menu';

const drawerWidth = 240;

export default function DashboardLayout({ user }) {
    const [mobileOpen, setMobileOpen] = React.useState(false);
    const handleDrawerToggle = () => setMobileOpen((prev) => !prev);

    return (
        <Box sx={{ display: 'flex' }}>
            <AppBar
                position="fixed"
                sx={{
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    width: { md: `calc(100% - ${drawerWidth}px)` },
                    ml: { md: `${drawerWidth}px` },
                }}
            >
                <Toolbar>
                    {/* Hamburger on mobile */}
                    <IconButton
                        color="inherit"
                        edge="start"
                        onClick={handleDrawerToggle}
                        sx={{ mr: 2, display: { md: 'none' } }}
                    >
                        <MenuIcon />
                    </IconButton>

                    <Typography variant="h6" noWrap component="div">
                        Discord Backup Bot
                    </Typography>
                    <Box sx={{ flexGrow: 1 }} />
                    <Typography variant="body2">
                        {user.username}
                    </Typography>
                </Toolbar>
            </AppBar>

            {/* Nav container for both drawer variants */}
            <Box
                component="nav"
                sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}
            >
                {/* Mobile drawer (temporary) */}
                <Drawer
                    variant="temporary"
                    open={mobileOpen}
                    onClose={handleDrawerToggle}
                    ModalProps={{ keepMounted: true }}
                    sx={{
                        display: { xs: 'block', md: 'none' },
                        '& .MuiDrawer-paper': {
                            width: drawerWidth,
                            boxSizing: 'border-box',
                        },
                    }}
                >
                    <Toolbar />
                    <Box sx={{ overflow: 'auto' }}>
                        <List>
                            <ListItemButton component={Link} to="/add-server">
                                <ListItemText primary="Add Server" />
                            </ListItemButton>
                            <ListItemButton component={Link} to="/manage-channels">
                                <ListItemText primary="Manage Channels" />
                            </ListItemButton>
                        </List>
                    </Box>
                </Drawer>

                {/* Desktop drawer (permanent) */}
                <Drawer
                    variant="permanent"
                    sx={{
                        display: { xs: 'none', md: 'block' },
                        '& .MuiDrawer-paper': {
                            width: drawerWidth,
                            boxSizing: 'border-box',
                        },
                    }}
                    open
                >
                    <Toolbar />
                    <Box sx={{ overflow: 'auto' }}>
                        <List>
                            <ListItemButton component={Link} to="/add-server">
                                <ListItemText primary="Add Server" />
                            </ListItemButton>
                            <ListItemButton component={Link} to="/manage-channels">
                                <ListItemText primary="Manage Channels" />
                            </ListItemButton>
                        </List>
                    </Box>
                </Drawer>
            </Box>

            {/* Main content */}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    p: 3,
                    mt: 8, // below AppBar
                    width: { md: `calc(100% - ${drawerWidth}px)` },
                }}
            >
                <Outlet />
            </Box>
        </Box>
    );
}
