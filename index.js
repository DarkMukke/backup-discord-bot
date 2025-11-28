// AFTER (ESM, index.js)
import 'dotenv/config';
import fetch from 'node-fetch';
import { query } from './db.js';
import { client } from './bot.js';




async function upsertChannel(channel) {
    if (!channel || !channel.id) return;

    await query(
        `
    INSERT INTO channels (discord_channel_id, name, guild_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (discord_channel_id) DO UPDATE
    SET name = EXCLUDED.name,
        guild_id = EXCLUDED.guild_id,
        updated_at = NOW()
    `,
        [channel.id, channel.name ?? channel.id, channel.guild?.id ?? 0]
    );
}
function buildContentMarkdown(message) {
    // Base content
    let text = message.content || '';

    // Include simple embed text so button/select replies aren’t empty[web:699][web:614]
    for (const embed of message.embeds || []) {
        if (embed.title) text += `\n**${embed.title}**`;
        if (embed.description) text += `\n${embed.description}`;
        for (const field of embed.fields || []) {
            text += `\n${field.name}: ${field.value}`;
        }
    }

    return text.trim();
}

async function insertMessageRevision(message, { isDeleted = false } = {}) {
    if (!message.guild || !message.channel) return;

    await upsertChannel(message.channel);

    const [channelRow] = await query(
        'SELECT id FROM channels WHERE discord_channel_id = $1',
        [message.channel.id]
    );
    if (!channelRow) return;

    const channelId = channelRow.id;

    const existing = await query(
        `
      SELECT id, edit_group_id
      FROM messages
      WHERE discord_message_id = $1
      ORDER BY revision_created_at ASC
      LIMIT 1
    `,
        [message.id]
    );

    let editGroupId = null;
    if (existing.length > 0) {
        editGroupId = existing[0].edit_group_id || existing[0].id;
    }

    const contentMarkdown = buildContentMarkdown(message);

    const inserted = await query(
        `
      INSERT INTO messages (
        discord_message_id,
        channel_id,
        author_id,
        author_username,
        created_at,
        is_current_revision,
        is_deleted,
        edit_group_id,
        content_markdown,
        raw_content,
        attachment_summary
      )
      VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$8,$9,$10)
      RETURNING id
    `,
        [
            message.id,
            channelId,
            message.author?.id ?? '0',
            message.author?.tag ?? 'unknown',
            message.createdAt?.toISOString() ?? new Date().toISOString(),
            isDeleted,
            editGroupId,
            contentMarkdown,
            message.content ?? null,
            JSON.stringify(
                message.attachments?.map?.((a) => ({
                    id: a.id,
                    filename: a.name,
                    url: a.url,
                    size: a.size,
                    contentType: a.contentType,
                })) || []
            ),
        ]
    );

    const newId = inserted[0].id;

    if (!editGroupId) {
        await query('UPDATE messages SET edit_group_id = $1 WHERE id = $1', [newId]);
    } else {
        await query(
            `
        UPDATE messages
        SET is_current_revision = FALSE
        WHERE discord_message_id = $1
          AND id <> $2
      `,
            [message.id, newId]
        );
    }
}

// Live listeners: STOP skipping bots now
client.on('messageCreate', async (message) => {
    try {
        await insertMessageRevision(message);
    } catch (err) {
        console.error('messageCreate error:', err);
    }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    const message = newMessage.partial ? await newMessage.fetch() : newMessage;
    try {
        await insertMessageRevision(message);
    } catch (err) {
        console.error('messageUpdate error:', err);
    }
});


client.on('messageDelete', async (message) => {
    try {
        // soft-delete: mark all revisions of this discord_message_id as deleted
        await query(
            `
      UPDATE messages
      SET is_deleted = TRUE, updated_at = NOW()
      WHERE discord_message_id = $1
      `,
            [message.id]
        );
    } catch (err) {
        console.error('messageDelete error:', err);
    }
});

client.on('threadCreate', async (thread) => {
    try {
        if (thread.joinable) {
            await thread.join();
            console.log(`Joined thread ${thread.id} in ${thread.guild?.name}`);
        }
    } catch (e) {
        console.error('Failed to join thread', thread.id, e);
    }
});




async function backfillOnceForChannel(discordChannelId, limit = 50) {
    const channel = await client.channels.fetch(discordChannelId);
    if (!channel?.isTextBased()) return;

    const [row] = await query(
        `
            SELECT
                id,
                last_backfilled_message_id,
                backfill_complete,
                archiving_enabled
            FROM channels
            WHERE discord_channel_id = $1
        `,
        [discordChannelId]
    );

    // If not configured or archiving disabled, do nothing
    if (!row || !row.archiving_enabled) return;

    // If backfill already complete, do nothing
    if (row.backfill_complete) return;


    const fetchOptions = { limit };
    if (row?.last_backfilled_message_id) {
        fetchOptions.before = row.last_backfilled_message_id.toString();
    }

    const messages = await channel.messages.fetch(fetchOptions); // auto obeys rate limits[web:96]
    if (messages.size === 0) {
        await query(
            'UPDATE channels SET backfill_complete = TRUE, updated_at = NOW() WHERE discord_channel_id = $1',
            [discordChannelId]
        );
        return;
    }

    let oldest = null;
    for (const msg of messages.values()) {
        oldest = !oldest || msg.id < oldest ? msg.id : oldest;
        await insertMessageRevision(msg);
    }

    await query(
        `
    UPDATE channels
    SET last_backfilled_message_id = $1::bigint, updated_at = NOW()
    WHERE discord_channel_id = $2
    `,
        [oldest, discordChannelId]
    );
}

async function getChannelsToBackfill() {
    // Channels that need backfill, not yet completed
    return await query(`
    SELECT discord_channel_id
    FROM channels
    WHERE backfill_complete = FALSE
  `);
}

async function backfillAttachmentBlobs(batchSize = 50) {
    //console.log(`Backfill attachment blobs: ${batchSize}`);
    // 1) Find messages that have attachment_summary and at least one attachment not yet stored
    const messages = await query(
        `
            SELECT id AS message_id, attachment_summary
            FROM messages
            WHERE attachment_summary IS NOT NULL
              AND attachment_summary <> '[]'
              AND NOT EXISTS (
                SELECT 1
                FROM stored_attachments sa
                WHERE sa.message_id = messages.id
            )
                LIMIT $1
        `,
        [batchSize]
    );

    if (messages.length === 0) {
        //console.log('blob backfill: no candidate messages');
        return;
    }

    for (const msg of messages) {
        let attachments = [];
        const raw = msg.attachment_summary;

        // Same decoding logic as API
        if (Array.isArray(raw)) {
            attachments = raw;
        } else if (typeof raw === 'string' && raw.trim() !== '') {
            try {
                attachments = JSON.parse(raw);
            } catch (e) {
                console.warn('blob backfill: bad attachment_summary JSON for message', msg.message_id, e);
                attachments = [];
            }
        } else if (raw && typeof raw === 'object') {
            attachments = [raw];
        }

        if (!attachments.length) continue;

        for (const att of attachments) {
            if (!att || !att.id || !att.url) continue;

            // Skip if already stored
            const existing = await query(
                `
                    SELECT 1
                    FROM stored_attachments
                    WHERE discord_attachment_id = $1 AND message_id = $2
                        LIMIT 1
                `,
                [att.id, msg.message_id]
            );
            if (existing.length) continue;

            // Enforce size limit (10 MB)
            if (att.size && att.size > 10 * 1024 * 1024) {
                console.log('blob backfill: skipping large attachment', att.id, att.size);
                continue;
            }

            try {
                const res = await fetch(att.url);
                if (!res.ok) {
                    console.warn('blob backfill: fetch failed', att.url, res.status);
                    continue;
                }
                const buf = Buffer.from(await res.arrayBuffer());
                const size = att.size || buf.length;

                if (size > 10 * 1024 * 1024) {
                    // In case size was unknown and the downloaded file is too big
                    console.log('blob backfill: downloaded too large, skipping', att.id, size);
                    continue;
                }

                await query(
                    `
            INSERT INTO stored_attachments (
              discord_attachment_id,
              message_id,
              filename,
              size_bytes,
              content_type,
              url,
              blob_data
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7)
          `,
                    [
                        att.id,
                        msg.message_id,
                        att.filename || 'file',
                        size,
                        att.contentType || res.headers.get('content-type'),
                        att.url,
                        buf,
                    ]
                );
                //console.log('blob backfill: stored attachment', att.id, 'for message', msg.message_id);
            } catch (e) {
                console.error('blob backfill: error for attachment', att?.id, e);
            }
        }
    }
}

async function backfillLoop() {
    setInterval(async () => {
        const channels = await getChannelsToBackfill();
        for (const row of channels) {
            try {
                await backfillOnceForChannel(row.discord_channel_id, 50);
            } catch (err) {
                console.error('backfill error for channel', row.discord_channel_id, err);
            }
        }
    }, 30_000);
    setInterval(async () => {
        try {
            await backfillAttachmentBlobs(50);
        } catch (err) {
            console.error('backfill error for blobs', err);
        }
    }, 60_000);
}


client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    backfillLoop();
});
