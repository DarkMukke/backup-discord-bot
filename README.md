# Discord BackupBot 

![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-339933?logo=node.js&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-14.19.3-5865F2?logo=discord&logoColor=white)
![React](https://img.shields.io/badge/react-19.2.0-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/vite-7.2.4-646CFF?logo=vite&logoColor=white)


This is a simple discord bot, written because it was requested by a friend so all it's features are bespoke.


## Current features: 
 
- Channel list of channels the bot can see
- Archiving or backing up a channel is enabled or disabled per channel
  - Backing up a channel also back's up its threads
- Tracks message edits and deletes
- Uses a backfill message id, to be able to pickup where it last off in case of bot restarts
  - This also ensures that the bot is rate limited on the Discord API, by scanning 50 messages every 30 seconds per channel ( so if you do 10 channels at the same time this is still 250 messages/min)
- Renders roles, usernames, channels, time stamps, bot messages, etc
- Uses "Endless Scroll" on the messages, 50 messages at a time
- Uses postgres sessions to stay logged in between bot restarts
- Backs up attachments in Postgres in a BYTEA column on a separate loop if attachment < 10mb
- Render emoji's and Tenor Gifs ( these are not backed up, as they are external )

## Install
Currently only supports Postgres, schema can be found in [docs/db-schema.md](docs/db-schema.md)

```bash
cp .env.example .env
cp ui/.env.example ui/.env
```

Edit the `.env` and `ui/.env` files. 

```bash
npm i
cd ui && npm i && npm run build && cd ..
pm2 start ecosystem.config.cjs
```

Now either run it on your selected port or use a reverse proxy ( example for nginx can be found in the docs )