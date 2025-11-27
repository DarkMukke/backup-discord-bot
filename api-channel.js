// api-channel.js
import express from 'express';
import {query} from './db.js';
import {client} from "./bot.js";

const router = express.Router();

router.get('/', async (req, res) => {
    if (!req.session.user) return res.sendStatus(401);

    const guildId = req.query.guildId;
    if (!guildId) {
        return res.status(400).json({ error: 'guildId query param required' });
    }

    const rows = await query(
        `
            SELECT
                c.discord_channel_id,
                c.name,
                c.archiving_enabled,
                c.backfill_complete,
                COALESCE(COUNT(DISTINCT m.edit_group_id), 0) AS message_count
            FROM channels c
                     LEFT JOIN messages m
                               ON m.channel_id = c.id
            WHERE c.guild_id = $1
            GROUP BY
                c.discord_channel_id,
                c.name,
                c.archiving_enabled,
                c.backfill_complete;
        `,
        [guildId]
    );

    res.json(rows);
});

// enable / upsert channel
router.post('/', async (req, res) => {
    if (!req.session.user) return res.sendStatus(401);

    const { discord_channel_id, name, guild_id } = req.body;
    if (!discord_channel_id || !guild_id) {
        return res.status(400).json({ error: 'discord_channel_id and guild_id required' });
    }

    // Always enable the parent channel itself
    await query(
        `
            INSERT INTO channels (discord_channel_id, name, guild_id, archiving_enabled, backfill_complete)
            VALUES ($1, $2, $3, TRUE, FALSE)
            ON CONFLICT (discord_channel_id) DO UPDATE
                SET name = EXCLUDED.name,
                    guild_id = EXCLUDED.guild_id,
                    archiving_enabled = TRUE,
                    updated_at = NOW()
        `,
        [discord_channel_id, name ?? discord_channel_id, guild_id]
    );

    // Also enable all threads under this parent (if not already rows)
    try {
        const guild = await client.guilds.fetch(guild_id);
        const parent = await guild.channels.fetch(discord_channel_id);

        if (parent) {
            const threads = await parent.threads.fetchActive();
            const archived = await parent.threads.fetchArchived({ limit: 100 });
            const allThreads = [
                ...threads.threads.values(),
                ...archived.threads.values(),
            ];

            for (const t of allThreads) {
                await query(
                    `
            INSERT INTO channels (discord_channel_id, name, guild_id, archiving_enabled, backfill_complete)
            VALUES ($1, $2, $3, TRUE, FALSE)
            ON CONFLICT (discord_channel_id) DO UPDATE
            SET name = EXCLUDED.name,
                guild_id = EXCLUDED.guild_id,
                archiving_enabled = TRUE,
                updated_at = NOW()
          `,
                    [t.id, t.name, guild_id]
                );
            }
        }
    } catch (e) {
        console.error('Error enabling threads for parent', discord_channel_id, e);
    }

    res.sendStatus(204);
});


router.delete('/:discordChannelId', async (req, res) => {
    if (!req.session.user) return res.sendStatus(401);
    const discordChannelId = req.params.discordChannelId;

    // Turn off archiving on this channel
    await query(
        `
            UPDATE channels
            SET archiving_enabled = FALSE,
                backfill_complete = FALSE,
                updated_at = NOW()
            WHERE discord_channel_id = $1
        `,
        [discordChannelId]
    );

    // Also disable all threads whose parent is this channel
    const client = req.app.get('discordClient');
    try {
        const guildRow = await query(
            'SELECT guild_id FROM channels WHERE discord_channel_id = $1',
            [discordChannelId]
        );
        const guildId = guildRow[0]?.guild_id;
        if (guildId) {
            const guild = await client.guilds.fetch(guildId);
            const parent = await guild.channels.fetch(discordChannelId);
            if (parent) {
                const threads = await parent.threads.fetchActive();
                const archived = await parent.threads.fetchArchived({ limit: 100 });
                const allThreads = [
                    ...threads.threads.values(),
                    ...archived.threads.values(),
                ];

                const ids = allThreads.map((t) => t.id);
                if (ids.length > 0) {
                    await query(
                        `
              UPDATE channels
              SET archiving_enabled = FALSE,
                  backfill_complete = FALSE,
                  updated_at = NOW()
              WHERE discord_channel_id = ANY($1::bigint[])
            `,
                        [ids]
                    );
                }
            }
        }
    } catch (e) {
        console.error('Error disabling threads for parent', discordChannelId, e);
    }

    res.sendStatus(204);
});


// GET /api/channels/:discordChannelId/messages
router.get('/:discordChannelId/messages', async (req, res) => {
    if (!req.session.user) return res.sendStatus(401);
    const { discordChannelId } = req.params;
    const { cursor, limit = 50 } = req.query;

    const [channelRow] = await query(
        'SELECT id, guild_id FROM channels WHERE discord_channel_id = $1',
        [discordChannelId]
    );
    if (!channelRow) return res.json({ messages: [], nextCursor: null });

    const guildId = channelRow.guild_id;
    const guild = await client.guilds.fetch(guildId);

    const params = [channelRow.id];
    let where = 'm.channel_id = $1 AND m.is_current_revision = TRUE';
    if (cursor) {
        params.push(cursor);
        where += ' AND m.discord_message_id < $2::bigint';
    }

    params.push(limit);
    const rows = await query(
        `
            SELECT
                m.discord_message_id,
                m.author_id,
                m.author_username,
                m.created_at,
                m.content_markdown,
                m.edit_group_id,
                m.is_deleted,
                (SELECT COUNT(*) FROM messages m2
                 WHERE m2.edit_group_id = m.edit_group_id) > 1 AS has_edits
            FROM messages m
            WHERE ${where}
            ORDER BY m.discord_message_id DESC
            LIMIT $${params.length}
    `,
        params
    );



    const nextCursor =
        rows.length > 0 ? rows[rows.length - 1].discord_message_id : null;

    // collect unique author_ids
    const authorIds = [...new Set(rows.map(r => r.author_id).filter(Boolean))];

    let members = new Map();
    if (authorIds.length > 0) {
        members = await guild.members.fetch({user: authorIds}); // this is a Collection keyed by ID[web:542]
    }

    // Build role + channel maps
    const roles = guild.roles.cache;      // Collection<string, Role>
    const channels = guild.channels.cache; // Collection<string, GuildChannel>

    // add after you have members, roles, channels
    const tokenizeContent = (raw) => {
        const text = raw || '';
        const tokens = [];
        let lastIndex = 0;

        // user | role | channel | relative timestamp[web:610]
        const regex = /<@!?(\d+)>|<@&(\d+)>|<#(\d+)>|<t:(\d+):R>/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                tokens.push({
                    type: 'text',
                    text: text.slice(lastIndex, match.index),
                });
            }

            if (match[1]) {
                const id = match[1];
                const member = members.get(id);
                tokens.push({
                    type: 'user',
                    id,
                    label: member ? `@${member.displayName}` : match[0],
                });
            } else if (match[2]) {
                const id = match[2];
                const role = roles.get(id);
                tokens.push({
                    type: 'role',
                    id,
                    label: role ? `@${role.name}` : match[0],
                });
            } else if (match[3]) {
                const id = match[3];
                const ch = channels.get(id);
                tokens.push({
                    type: 'channel',
                    id,
                    label: ch ? `#${ch.name}` : match[0],
                });
            } else if (match[4]) {
                // timestamp <t:1764581844:R>
                const tsSeconds = Number(match[4]);
                tokens.push({
                    type: 'timestamp',
                    ts: tsSeconds,
                });
            }

            lastIndex = regex.lastIndex;
        }

        if (lastIndex < text.length) {
            tokens.push({
                type: 'text',
                text: text.slice(lastIndex),
            });
        }

        return tokens;
    };


    const messages = rows.map((r) => {
        const member = members.get(r.author_id);
        const displayAuthor = member?.displayName || r.author_username;

        return {
            ...r,
            display_author: displayAuthor,
            content_tokens: tokenizeContent(r.content_markdown),
        };
    });

    res.json({ messages, nextCursor });
});

// GET /api/channels/messages/:discordMessageId/revisions
router.get('/messages/:discordMessageId/revisions', async (req, res) => {
    if (!req.session.user) return res.sendStatus(401);
    const { discordMessageId } = req.params;

    const rows = await query(
        `
            SELECT
                m.id,
                m.created_at,
                m.content_markdown,
                m.is_deleted
            FROM messages m
            WHERE m.discord_message_id = $1
            ORDER BY m.revision_created_at ASC
        `,
        [discordMessageId]
    );

    res.json(rows);
});

export default router;
