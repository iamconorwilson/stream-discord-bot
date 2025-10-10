declare namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: 'development' | 'production' | 'test';
        TWITCH_CLIENT_ID: string;
        TWITCH_CLIENT_SECRET: string;
        EVENTSUB_SECRET: string;
        DISCORD_WEBHOOK_URL: string;
        DATA_DIR: string;
        HOSTNAME?: string; // Optional for development
        PORT?: string; // Optional for development
    }
}