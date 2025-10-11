declare namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: 'development' | 'production' | 'test';
        TWITCH_CLIENT_ID: string;
        TWITCH_CLIENT_SECRET: string;
        DISCORD_WEBHOOK_URL: string;
        DATA_DIR: string;
        HOSTNAME: string;
        PORT?: string; // Optional, defaults to 3000
        EVENTSUB_SECRET?: string; // Optional, for EventSub testing
    }
}