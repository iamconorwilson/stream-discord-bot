declare namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: 'development' | 'production' | 'test';
        TWITCH_CLIENT_ID: string;
        TWITCH_CLIENT_SECRET: string;
        EVENTSUB_SECRET: string;
        DISCORD_WEBHOOK_URL: string;
        CHANNELS_PATH: string;
        NGROK_AUTH_TOKEN?: string; // Optional for production
        HOSTNAME?: string; // Optional for development
        PORT?: string; // Optional for development
    }
}