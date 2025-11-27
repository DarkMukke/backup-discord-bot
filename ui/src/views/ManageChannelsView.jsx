// src/views/ManageChannelsView.jsx
import React, { useEffect, useState } from 'react';
import {
    Box,
    Typography,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Switch,
} from '@mui/material';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import ForumIcon from '@mui/icons-material/Forum';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { CircularProgress } from '@mui/material';

function channelTypeIcon(type, isThread) {
    if (isThread) return <ForumIcon fontSize="small" />;
    switch (type) {
        case 0:
        case 5:
            return <ChatBubbleOutlineIcon fontSize="small" />;
        case 2:
        case 13:
            return <VolumeUpIcon fontSize="small" />;
        default:
            return <ChatBubbleOutlineIcon fontSize="small" />;
    }
}

export default function ManageChannelsView() {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialGuildId = searchParams.get('guildId') || '';
    const navigate = useNavigate();

    const [guilds, setGuilds] = useState([]);
    const [selectedGuildId, setSelectedGuildId] = useState(initialGuildId);
    const [channels, setChannels] = useState([]);
    const [channelStates, setChannelStates] = useState(new Map());
    const [channelsLoading, setChannelsLoading] = useState(true);

    const loadChannelsAndState = React.useCallback(async (guildId) => {
        setChannelsLoading(true);
        try {
            const [channelsJson, rows] = await Promise.all([
                fetch(`/api/guilds/${guildId}/channels`, {
                    credentials: 'include',
                }).then((res) => (res.ok ? res.json() : [])),
                fetch(`/api/channels?guildId=${guildId}`, {
                    credentials: 'include',
                }).then((res) => (res.ok ? res.json() : [])),
            ]);

            setChannels(channelsJson);

            const map = new Map();
            for (const r of rows) {
                map.set(String(r.discord_channel_id), {
                    archiving_enabled: r.archiving_enabled,
                    backfill_complete: r.backfill_complete,
                    message_count: Number(r.message_count) || 0,
                });
            }
            setChannelStates(map);
        } catch (e) {
            console.error('channels/state error', e);
        } finally {
            setChannelsLoading(false);
        }
    }, []);

    // Keep selectedGuildId in the URL (?guildId=...)
    useEffect(() => {
        if (selectedGuildId) {
            setSearchParams({ guildId: selectedGuildId });
        } else {
            setSearchParams({});
        }
    }, [selectedGuildId, setSearchParams]) //;[web:451]

    // Load guilds once
    useEffect(() => {
        fetch('/api/guilds', { credentials: 'include' })
            .then((res) => (res.ok ? res.json() : []))
            .then(setGuilds)
            .catch((e) => console.error('guilds error', e));
    }, []);

    // If URL had a guildId, ensure state matches it
    useEffect(() => {
        if (!selectedGuildId && initialGuildId) {
            setSelectedGuildId(initialGuildId);
        }
    }, [initialGuildId, selectedGuildId]);

    // Load channels + DB state when guild changes
    // initial load when guild changes (channels + state once)
    useEffect(() => {
        if (!selectedGuildId) {
            setChannels([]);
            setChannelStates(new Map());
            return;
        }

        const loadInitial = async () => {
            setChannelsLoading(true);
            try {
                const [channelsJson, rows] = await Promise.all([
                    fetch(`/api/guilds/${selectedGuildId}/channels`, {
                        credentials: 'include',
                    }).then((res) => (res.ok ? res.json() : [])),
                    fetch(`/api/channels?guildId=${selectedGuildId}`, {
                        credentials: 'include',
                    }).then((res) => (res.ok ? res.json() : [])),
                ]);

                setChannels(channelsJson);

                const map = new Map();
                for (const r of rows) {
                    map.set(String(r.discord_channel_id), {
                        archiving_enabled: r.archiving_enabled,
                        backfill_complete: r.backfill_complete,
                        message_count: Number(r.message_count) || 0,
                    });
                }
                setChannelStates(map);
            } catch (e) {
                console.error('channels/state error', e);
            } finally {
                setChannelsLoading(false);
            }
        };

        void loadInitial();
    }, [selectedGuildId]);

    useEffect(() => {
        if (!selectedGuildId) return;

        const poll = async () => {
            try {
                const res = await fetch(`/api/channels?guildId=${selectedGuildId}`, {
                    credentials: 'include',
                });
                if (!res.ok) return;
                const rows = await res.json();

                const map = new Map();
                for (const r of rows) {
                    map.set(String(r.discord_channel_id), {
                        archiving_enabled: r.archiving_enabled,
                        backfill_complete: r.backfill_complete,
                        message_count: Number(r.message_count) || 0,
                    });
                }
                setChannelStates(map);
            } catch (e) {
                console.error('poll channel states error', e);
            }
        };

        const interval = setInterval(poll, 10_000); // 10s
        // optional: run once immediately
        void poll();

        return () => clearInterval(interval);
    }, [selectedGuildId]);



    const handleToggleArchiving = async (ch) => {
        const key = String(ch.id);
        const current = channelStates.get(key) || {
            archiving_enabled: false,
            backfill_complete: false,
            message_count: 0,
        };
        const nextEnabled = !current.archiving_enabled;

        if (nextEnabled) {
            await fetch('/api/channels', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    discord_channel_id: ch.id,
                    name: ch.name,
                    guild_id: selectedGuildId,
                }),
            });
        } else {
            await fetch(`/api/channels/${ch.id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
        }

        const newMap = new Map(channelStates);
        newMap.set(key, {
            ...current,
            archiving_enabled: nextEnabled,
            backfill_complete: nextEnabled ? current.backfill_complete : false,
        });
        setChannelStates(newMap);
    };

    // Parents + threads (same as before)
    const parentChannels = channels.filter((c) => !c.isThread);
    const threadsByParent = channels.reduce((map, ch) => {
        if (!ch.isThread || !ch.parentId) return map;
        const arr = map.get(ch.parentId) || [];
        arr.push(ch);
        map.set(ch.parentId, arr);
        return map;
    }, new Map());

    const ordered = [];
    for (const parent of parentChannels) {
        ordered.push(parent);
        const threads = threadsByParent.get(parent.id) || [];
        threads.sort((a, b) => a.name.localeCompare(b.name));
        ordered.push(...threads);
    }

    // Group ordered rows by sectionName (category)
    const sections = new Map();
    for (const ch of ordered) {
        const key = ch.sectionName || 'No Category';
        const arr = sections.get(key) || [];
        arr.push(ch);
        sections.set(key, arr);
    }

    return (
        <Box>
            <Typography variant="h5" gutterBottom>
                Manage Channels
            </Typography>

            <FormControl sx={{ minWidth: 260, mb: 3 }}>
                <InputLabel id="guild-select-label">Select Server</InputLabel>
                <Select
                    labelId="guild-select-label"
                    label="Select Server"
                    value={selectedGuildId}
                    onChange={(e) => setSelectedGuildId(e.target.value)}
                >
                    {guilds.map((g) => (
                        <MenuItem key={g.id} value={g.id}>
                            {g.name}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>

            {selectedGuildId && (
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Channel</TableCell>
                                <TableCell align="right">Messages</TableCell>
                                <TableCell align="center">Archiving</TableCell>
                                <TableCell align="center">Backfill</TableCell>
                                <TableCell align="center">View</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {channelsLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} align="center">
                                        <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}>
                                            <CircularProgress size={24} />
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                [...sections.entries()].map(([sectionName, rows]) => (
                                    <React.Fragment key={sectionName}>
                                        <TableRow>
                                            <TableCell
                                                colSpan={5}
                                                sx={{ fontWeight: 'bold', bgcolor: 'background.default' }}
                                            >
                                                {sectionName}
                                            </TableCell>
                                        </TableRow>

                                        {rows.map((ch) => {
                                            const state = channelStates.get(String(ch.id)) || {
                                                archiving_enabled: false,
                                                backfill_complete: false,
                                                message_count: 0,
                                            };
                                            const isThread = ch.isThread;

                                            let archivingEnabled = state.archiving_enabled;
                                            if (isThread && ch.parentId) {
                                                const parentState = channelStates.get(String(ch.parentId));
                                                if (parentState) {
                                                    archivingEnabled = parentState.archiving_enabled;
                                                }
                                            }

                                            return (
                                                <TableRow key={ch.id}>
                                                    <TableCell>
                                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                            {isThread && <span style={{ width: 16 }} />}
                                                            {channelTypeIcon(ch.type, isThread)}
                                                            <span style={{ marginLeft: 8 }}>{ch.name}</span>
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        {state.message_count}
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Switch
                                                            size="small"
                                                            checked={archivingEnabled}
                                                            onChange={() =>
                                                                !isThread && handleToggleArchiving(ch)
                                                            }
                                                            disabled={isThread}
                                                        />
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        {state.backfill_complete ? (
                                                            <CheckCircleIcon
                                                                fontSize="small"
                                                                color="success"
                                                                titleAccess="Backfill complete"
                                                            />
                                                        ) : (
                                                            <HourglassEmptyIcon
                                                                fontSize="small"
                                                                color="warning"
                                                                titleAccess="Backfill in progress or not started"
                                                            />
                                                        )}
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <VisibilityIcon
                                                            fontSize="small"
                                                            style={{ cursor: 'pointer' }}
                                                            onClick={() =>
                                                                navigate(
                                                                    `/channels/${ch.id}?guildId=${selectedGuildId}`
                                                                )
                                                            }
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </React.Fragment>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
                )}
        </Box>
    );
}
