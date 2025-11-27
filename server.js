// server.js
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import connectPgSimple from 'connect-pg-simple';
const PgSession = connectPgSimple(session);


import authRouter from './auth.js';
import guildRouter from './api-guild.js';
import channelRouter from './api-channel.js';
import './bot.js';
import { pool } from './db.js';

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

// Placeholder APIs to extend later
app.get('/api/guilds', (req, res) => {
    if (!req.session.user) return res.sendStatus(401);
    res.json([]); // TODO: implement
});

app.get('/api/channels', (req, res) => {
    if (!req.session.user) return res.sendStatus(401);
    res.json([]); // TODO: implement
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
