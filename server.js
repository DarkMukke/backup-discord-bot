// server.js
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import connectPgSimple from 'connect-pg-simple';
const PgSession = connectPgSimple(session);
import fetch from 'node-fetch';


import authRouter from './auth.js';
import guildRouter from './api-guild.js';
import channelRouter from './api-channel.js';
import './bot.js';
import { pool, query } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());

app.use(
    session({
        store: new PgSession({
            pool,                // connection pool
            tableName: 'session' // default, can change
        }),
        secret: process.env.SESSION_SECRET || 'change_me',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        },
    })
);


// in dev, UI may run on 8003; allow cookies
app.use(
    cors({
        origin: ['http://localhost:8003', 'http://localhost:8002'],
        credentials: true,
    })
);

// OAuth routes
app.use('/auth', authRouter);

//guild routes
app.use('/api/guilds', guildRouter);

//channel routes
app.use('/api/channels', channelRouter);


// Session check endpoint
app.get('/api/me', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ authenticated: false });
    }
    res.json({ authenticated: true, user: req.session.user });
});

app.get('/api/attachments/:id', async (req, res) => {
    const { id } = req.params;
    const [row] = await query(
        `
      SELECT filename, content_type, blob_data
      FROM stored_attachments
      WHERE id = $1
    `,
        [id]
    );
    if (!row) return res.sendStatus(404);

    res.setHeader('Content-Type', row.content_type || 'application/octet-stream');
    res.setHeader(
        'Content-Disposition',
        `inline; filename="${row.filename.replace(/"/g, '')}"`
    );
    res.send(row.blob_data);
});

const tenorCache = new Map(); // url -> mediaUrl
app.get('/api/tenor/resolve', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });

    if (tenorCache.has(url)) {
        return res.json({ mediaUrl: tenorCache.get(url) });
    }

    try {
        const r = await fetch(url);
        if (!r.ok) return res.status(502).json({ error: 'failed to fetch tenor' });
        const html = await r.text();

        // Crude extraction: look for a .mp4 or .gif URL in the page
        const m =
            html.match(/https:\/\/media\.tenor\.com\/[^"']+\.(mp4|gif)/i) ||
            html.match(/https:\/\/c\.tenor\.com\/[^"']+\.(mp4|gif)/i);

        if (!m) return res.json({ mediaUrl: null });

        const mediaUrl = m[0];
        tenorCache.set(url, mediaUrl);
        res.json({ mediaUrl });
    } catch (e) {
        console.error('tenor resolve error', e);
        res.status(500).json({ error: 'tenor resolve failed' });
    }
});


// Serve built React UI from ui/dist (production)
const uiDistPath = path.join(__dirname, 'ui', 'dist');
app.use(express.static(uiDistPath));

app.get('{*splat}', (req, res) => {
    res.sendFile(path.join(uiDistPath, 'index.html'));
});

const PORT = process.env.PORT || 8002;
app.listen(PORT, () => {
    console.log(`Web server listening on http://localhost:${PORT}`);
});
