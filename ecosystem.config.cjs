module.exports = {
    apps: [
        {
            name: 'discord-backup-bot',
            script: './index.js',
            watch: true,
            ignore_watch: ['[\\/\\]\\./', 'node_modules'],
            time: true,
            log_date_format: 'YYYY-MM-DD HH:mm Z',
        },
        {
            name: 'discord-backup-api',
            script: './server.js',
            watch: true,
            ignore_watch: ['[\\/\\]\\./', 'node_modules'],
            time: true,
            log_date_format: 'YYYY-MM-DD HH:mm Z',
        },
    ],
};
