
## Postgresql

```postgresql
create table public.channels
(
    id                         bigserial
    primary key,
    discord_channel_id         bigint                                 not null
    unique,
    name                       text                                   not null,
    guild_id                   bigint                                 not null,
    last_backfilled_message_id bigint,
    last_live_seen_message_id  bigint,
    backfill_complete          boolean                  default false not null,
    created_at                 timestamp with time zone default now() not null,
    updated_at                 timestamp with time zone default now() not null,
    archiving_enabled          boolean                  default true
);

alter table public.channels
owner to discord_bot_user;

create index idx_channels_guild_id
on public.channels (guild_id);

create table public.messages
(
    id                  bigserial
    primary key,
    discord_message_id  bigint                                 not null,
    channel_id          bigint                                 not null
    references public.channels
    on delete cascade,
    author_id           bigint                                 not null,
    author_username     text                                   not null,
    created_at          timestamp with time zone               not null,
    revision_created_at timestamp with time zone default now() not null,
    is_current_revision boolean                  default true  not null,
    is_deleted          boolean                  default false not null,
    edit_group_id       bigint
    constraint fk_messages_edit_group
    references public.messages
    deferrable initially deferred,
    content_markdown    text                                   not null,
    raw_content         text,
    attachment_summary  jsonb
);

alter table public.messages
owner to discord_bot_user;

create index idx_messages_channel_created_at
on public.messages (channel_id, created_at);

create index idx_messages_discord_id
on public.messages (discord_message_id);

create index idx_messages_edit_group
on public.messages (edit_group_id);

create index idx_messages_is_current
on public.messages (channel_id, is_current_revision)
where (is_current_revision = true);

create index idx_messages_is_deleted
on public.messages (channel_id, is_deleted);

create table public.attachments
(
    id                    bigserial
    primary key,
    message_row_id        bigint                                 not null
    references public.messages
    on delete cascade,
    discord_attachment_id bigint                                 not null,
    filename              text                                   not null,
    url                   text                                   not null,
    size_bytes            bigint,
    content_type          text,
    created_at            timestamp with time zone default now() not null
);

alter table public.attachments
owner to discord_bot_user;

create index idx_attachments_message_row_id
on public.attachments (message_row_id);

create index idx_attachments_discord_attachment_id
on public.attachments (discord_attachment_id);

create table public.oauth_users
(
    discord_user_id bigint not null
    primary key,
    access_token    text   not null,
    refresh_token   text
);

alter table public.oauth_users
owner to discord_bot_user;

create table public.session
(
    sid    varchar      not null
    primary key,
    sess   json         not null,
    expire timestamp(6) not null
);

alter table public.session
owner to discord_bot_user;

create index "IDX_session_expire"
on public.session (expire);

create table public.stored_attachments
(
    id                    bigserial                              primary key,
    discord_attachment_id bigint                                 not null,
    message_id            bigint                                 not null                 
        references public.messages on delete cascade,
    filename              text                                   not null,
    size_bytes            bigint                                 not null,
    content_type          text,
    url                   text,
    blob_data             bytea                                  not null,
    created_at            timestamp with time zone default now() not null
);

alter table public.stored_attachments
    owner to discord_bot_user;

create index stored_attachments_msg_idx
    on public.stored_attachments (message_id);

create index stored_attachments_msg_filename_idx
    on public.stored_attachments (message_id, filename);

```
