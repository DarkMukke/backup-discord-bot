// api-guilds.js
import express from 'express';
import fetch from 'node-fetch';
import { ChannelType } from 'discord.js'; // for type constants[web:296]

import {query} from './db.js';
import {client} from "./bot.js";

const router = express.Router();

async function getUserAccessToken(discordUserId) {
    const rows = await query(
        'SELECT access_token FROM oauth_users WHERE discord_user_id = $1',
        [discordUserId]
    );
    return rows[0]?.access_token || null;
}

const ADMINISTRATOR = 0x0000000000000008n; // bigint

router.get('/', async (req, res) => {
    if (!req.session.user) return res.sendStatus(401);

    const discordUserId = req.session.user.id;
    const accessToken = await getUserAccessToken(discordUserId);
    if (!accessToken) return res.sendStatus(401);

    // Get the user's guilds from Discord
    const guildRes = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!guildRes.ok) {
        console.error('Failed to fetch guilds:', guildRes.status);
        return res.sendStatus(502);
    }

    const guilds = await guildRes.json(); // includes `permissions` as a string or number[web:162][web:116]

    const botGuildIds = new Set(client.guilds.cache.map(g => g.id));

    const visible = guilds.filter(g => {
        // must be in a guild the bot is in
        if (!botGuildIds.has(g.id)) return false;

        // permissions is documented as a string representing an integer[web:162][web:260]
        const perms = BigInt(g.permissions);
        return (perms & ADMINISTRATOR) === ADMINISTRATOR;
    });

    res.json(visible);
});

// List channels for a guild where the bot is present
router.get('/:guildId/channels', async (req, res) => {
    if (!req.session.user) return res.sendStatus(401);
    const guildId = req.params.guildId;

    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) return res.status(404).send('Guild not found');

        const all = await guild.channels.fetch();

        const rows = [];
        for (const ch of all.values()) {
            if (!ch) continue;

            // Skip channels the bot cannot see
            //if (!ch.viewable) continue; // discord.js convenience flag[web:435]

            // Or, if you prefer explicit perms:
            const me = guild.members.me
                ?? await guild.members.fetchMe(); // ensures the bot member is available[web:542][web:88]
            const perms = ch.permissionsFor(me);
            if (!perms || !perms.has('ViewChannel')) continue;

            // Parent text / forum / announcement channels
            if (
                ch.type === ChannelType.GuildText ||
                ch.type === ChannelType.GuildAnnouncement ||
                ch.type === ChannelType.GuildForum
            ) {
                const parent = ch.parent; // CategoryChannel or null[web:556][web:413]

                rows.push({
                    id: ch.id,
                    name: ch.name,
                    type: ch.type,
                    parentId: null,
                    isThread: false,
                    sectionName: parent?.name || 'No Category',
                });

                // Active threads are usually fine
                let active;
                try {
                    active = await ch.threads.fetchActive();
                } catch (e) {
                    console.warn('Failed to fetch active threads for', ch.id, e.code);
                    active = { threads: new Map() };
                }

                for (const t of active.threads.values()) {
                    rows.push({
                        id: t.id,
                        name: t.name,
                        type: t.type,
                        parentId: ch.id,
                        isThread: true,
                        sectionName: parent?.name || 'No Category',
                    });
                }

                // Archived threads can 403 on private channels
                try {
                    const archived = await ch.threads.fetchArchived({ limit: 100 });
                    for (const t of archived.threads.values()) {
                        rows.push({
                            id: t.id,
                            name: t.name,
                            type: t.type,
                            parentId: ch.id,
                            isThread: true,
                            sectionName: parent?.name || 'No Category',
                        });
                    }
                } catch (err) {
                    if (err.code === 50001 || err.status === 403) {
                        console.warn(
                            `Skipping archived threads for channel ${ch.id} (missing access)`
                        );
                    } else {
                        console.error('Error fetching archived threads:', err);
                    }
                }
            }
        }

        res.json(rows);
    } catch (err) {
        console.error('Error fetching channels/threads:', err);
        res.sendStatus(500);
    }
});


export default router;
