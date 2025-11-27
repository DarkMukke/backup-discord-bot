import React from 'react';
import { Box, Typography, Button } from '@mui/material';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

export default function AddServerView() {
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot%20applications.commands&permissions=268435456`;

    return (
        <Box>
            <Typography variant="h5" gutterBottom>
                Add Server
            </Typography>
            <Typography variant="body1" paragraph>
                Invite the backup bot to a server you manage.
            </Typography>
            <Button variant="contained" color="primary" href={inviteUrl} target="_blank">
                Invite Bot to Server
            </Button>
        </Box>
    );
}
