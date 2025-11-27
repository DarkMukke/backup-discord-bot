import React, { useEffect, useState } from 'react';
import {
    CssBaseline,
    ThemeProvider,
    createTheme,
    Box,
    Button,
    Typography,
} from '@mui/material';
import DashboardLayout from './DashboardLayout.jsx';

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#5865F2' }, // Discord-ish
        background: { default: '#121212', paper: '#1e1e1e' },
    },
});

function App() {
    const [loading, setLoading] = useState(true);
    const [me, setMe] = useState(null);

    useEffect(() => {
        fetch('/api/me', { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : { authenticated: false }))
            .then((data) => {
                if (data.authenticated) setMe(data.user);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh">
                    <Typography>Loading...</Typography>
                </Box>
            </ThemeProvider>
        );
    }

    if (!me) {
        // Login page
        return (
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <Box
                    minHeight="100vh"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    flexDirection="column"
                    gap={2}
                >
                    <Typography variant="h4" gutterBottom>
                        Discord Backup Bot
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Log in with Discord to manage servers and channels.
                    </Typography>
                    <Button
                        variant="contained"
                        color="primary"
                        size="large"
                        href="/auth/discord"
                    >
                        Login with Discord
                    </Button>
                </Box>
            </ThemeProvider>
        );
    }

    // Authenticated: show dashboard
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <DashboardLayout user={me} />
        </ThemeProvider>
    );
}

export default App;
