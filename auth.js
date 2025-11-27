// auth.js
import express from 'express';
import { query } from './db.js';   // <— import your DB helper
// no import for fetch if on Node 18+

const router = express.Router();

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const OAUTH_SCOPE = ['identify', 'guilds'].join(' ');

// Step 1: redirect user to Discord
router.get('/discord', (req, res) => {
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: OAUTH_SCOPE,
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

// Step 2: handle callback and exchange code for tokens
router.get('/discord/callback', async (req, res) => {
    try {
        const code = req.query.code;
        if (!code) return res.status(400).send('No code');

        const body = new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
        });

        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });

        if (!tokenRes.ok) {
            const txt = await tokenRes.text();
            console.error('Token exchange failed:', tokenRes.status, txt);
            return res.sendStatus(502);
        }

        const tokenJson = await tokenRes.json();
        const accessToken = tokenJson.access_token;
        const refreshToken = tokenJson.refresh_token ?? null;

        // Fetch user info
        const userRes = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!userRes.ok) {
            const txt = await userRes.text();
            console.error('User fetch failed:', userRes.status, txt);
            return res.sendStatus(502);
        }

        const user = await userRes.json();

        // === WRITE TO DATABASE HERE ===
        await query(
            `
      INSERT INTO oauth_users (discord_user_id, access_token, refresh_token)
      VALUES ($1, $2, $3)
      ON CONFLICT (discord_user_id) DO UPDATE
      SET access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token
      `,
            [user.id, accessToken, refreshToken]
        );

        // Store minimal session
        req.session.user = {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
        };

        res.redirect('/');
    } catch (err) {
        console.error('OAuth callback error:', err);
        res.sendStatus(500);
    }
});

export default router;
