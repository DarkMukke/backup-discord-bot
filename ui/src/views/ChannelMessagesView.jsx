// src/views/ChannelMessagesView.jsx
import React, { useEffect, useState } from 'react';
import {
    Box,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Popover,
    Button,
} from '@mui/material';
import { useParams, useSearchParams, Link } from 'react-router-dom';

export default function ChannelMessagesView() {
    const { channelId } = useParams();
    const [searchParams] = useSearchParams();
    const guildId = searchParams.get('guildId') || '';

    const [messages, setMessages] = useState([]);
    const [nextCursor, setNextCursor] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const [anchorEl, setAnchorEl] = useState(null);
    const [hoveredMessageId, setHoveredMessageId] = useState(null);
    const [revisions, setRevisions] = useState([]);
    const [isOverPopover, setIsOverPopover] = useState(false);
    const [isOverCell, setIsOverCell] = useState(false);
    const hoverTimeoutRef = React.useRef(null);



    const open = Boolean(anchorEl);

    const renderContentTokens = (tokens) =>
        tokens.map((t, idx) => {
            if (t.type === 'user') {
                return (
                    <span key={idx} style={{ color: '#8ab4f8', fontWeight: 500 }}>
          {t.label}
        </span>
                );
            }
            if (t.type === 'role') {
                return (
                    <span key={idx} style={{ color: '#f5a97f', fontWeight: 500 }}>
          {t.label}
        </span>
                );
            }
            if (t.type === 'channel') {
                return (
                    <span key={idx} style={{ color: '#7dc4e4', fontWeight: 500 }}>
          {t.label}
        </span>
                );
            }
            if (t.type === 'timestamp') {
                const date = new Date(t.ts * 1000);
                const abs = date.toLocaleString('en-GB', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                });//[web:676][web:667]

                // simple relative string (optional)
                const now = Date.now();
                const diffSec = Math.round((now - date.getTime()) / 1000);
                let rel = '';
                const absDiff = Math.abs(diffSec);
                if (absDiff < 60) rel = `${absDiff}s ago`;
                else if (absDiff < 3600) rel = `${Math.round(absDiff / 60)}m ago`;
                else if (absDiff < 86400) rel = `${Math.round(absDiff / 3600)}h ago`;
                else rel = `${Math.round(absDiff / 86400)}d ago`;

                return (
                    <span
                        key={idx}
                        style={{ color: '#c3e88d', fontStyle: 'italic' }}
                        title={abs} // hover shows full timestamp
                    >
          {rel}
        </span>
                );
            }
            // plain text
            return <span key={idx}>{t.text}</span>;
        });



    useEffect(() => {
        let cancelled = false;

        const loadInitial = async () => {
            setLoadingMore(true);
            try {
                const res = await fetch(
                    `/api/channels/${channelId}/messages`,
                    { credentials: 'include' }
                );
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                setMessages(data.messages);
                setNextCursor(data.nextCursor);
                setHasMore(Boolean(data.nextCursor));
            } finally {
                if (!cancelled) setLoadingMore(false);
            }
        };

        setMessages([]);
        setNextCursor(null);
        setHasMore(true);
        void loadInitial();

        return () => {
            cancelled = true;
        };
    }, [channelId]);

    const loadMore = async () => {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        try {
            const params = new URLSearchParams();
            if (nextCursor) params.set('cursor', nextCursor);
            const res = await fetch(
                `/api/channels/${channelId}/messages?${params.toString()}`,
                { credentials: 'include' }
            );
            if (!res.ok) return;
            const data = await res.json();
            setMessages((prev) => [...prev, ...data.messages]);
            setNextCursor(data.nextCursor);
            setHasMore(Boolean(data.nextCursor));
        } finally {
            setLoadingMore(false);
        }
    };



    const scheduleClose = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
            setAnchorEl(null);
            setHoveredMessageId(null);
            setRevisions([]);
        }, 200);
    };

    const handleMouseEnterMessage = async (event, discordMessageId) => {
        setIsOverCell(true);
        setAnchorEl(event.currentTarget);
        setHoveredMessageId(discordMessageId);

        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }

        try {
            const res = await fetch(`/api/channels/messages/${discordMessageId}/revisions`, {
                credentials: 'include',
            });
            if (!res.ok) return;
            const data = await res.json();
            setRevisions(data);
        } catch (e) {
            console.error('Error loading revisions', e);
        }
    };

    const handleMouseLeaveMessage = () => {
        setIsOverCell(false);
        if (!isOverPopover) scheduleClose();
    };

    const handlePopoverEnter = () => {
        setIsOverPopover(true);
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
    };

    const handlePopoverLeave = () => {
        setIsOverPopover(false);
        if (!isOverCell) scheduleClose();
    };

    const handleScroll = (e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 100) {
            // within 100px of bottom
            void loadMore();
        }
    };

    return (
        <Box
            sx={{ maxHeight: '80vh', overflow: 'auto' }}
            onScroll={handleScroll}
        >
            <Typography variant="h5" gutterBottom>
                Channel Messages
            </Typography>
            <Button
                variant="outlined"
                size="small"
                component={Link}
                to={guildId ? `/manage-channels?guildId=${guildId}` : '/manage-channels'}
                sx={{ mb: 2 }}
            >
                ← Back to Manage Channels
            </Button>

            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Timestamp</TableCell>
                            <TableCell>Author</TableCell>
                            <TableCell>Message</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {messages.map((m) => {
                            const rowStyle = m.is_deleted
                                ? { textDecoration: 'line-through', opacity: 0.7 }
                                : {};
                            const canShowRevisions = m.has_edits;

                            return (
                                <TableRow key={m.discord_message_id} sx={rowStyle}>
                                    <TableCell>
                                        {new Date(m.created_at).toLocaleString('en-GB', {
                                            year: 'numeric',
                                            month: '2-digit',
                                            day: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit',
                                            hour12: false, // 24h clock[web:674][web:672]
                                        })}
                                    </TableCell>
                                    <TableCell>{m.display_author}</TableCell>
                                    <TableCell
                                        onMouseEnter={
                                            canShowRevisions
                                                ? (e) => handleMouseEnterMessage(e, m.discord_message_id)
                                                : undefined
                                        }
                                        onMouseLeave={canShowRevisions ? handleMouseLeaveMessage : undefined}
                                        style={{
                                            cursor: canShowRevisions ? 'help' : 'default',
                                            textDecoration: canShowRevisions ? 'underline' : 'none',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                        }}
                                    >
                                        {renderContentTokens(m.content_tokens || [])}
                                    </TableCell>
                                </TableRow>
                            );
                        })}

                        {loadingMore && (
                            <TableRow>
                                <TableCell colSpan={3} align="center">
                                    Loading…
                                </TableCell>
                            </TableRow>
                        )}

                        {!hasMore && messages.length > 0 && (
                            <TableRow>
                                <TableCell colSpan={3} align="center">
                                    End of messages
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Popover
                open={open}
                anchorEl={anchorEl}
                onClose={scheduleClose}
                disableRestoreFocus
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                PaperProps={{
                    onMouseEnter: handlePopoverEnter,
                    onMouseLeave: handlePopoverLeave,
                    sx: { p: 2, maxWidth: 400, maxHeight: '60vh', overflowY: 'auto' },
                }}
            >
                <Typography variant="subtitle2" gutterBottom>
                    Revisions
                </Typography>
                {revisions.map((r) => (
                    <Box key={r.id} sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                            {new Date(r.created_at).toLocaleString()}
                            {r.is_deleted ? ' (deleted)' : ''}
                        </Typography>
                        <Typography variant="body2">{r.content_markdown}</Typography>
                    </Box>
                ))}
            </Popover>
        </Box>
    );
}
