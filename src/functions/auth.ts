import { promises as fs } from 'fs';
import path from 'path';

// --- TYPE DEFINITIONS ---
type TokenType = 'user' | 'app';

interface TwitchApiConfig {
    clientId: string;
    clientSecret: string;
    userTokenPath: string;
    appTokenPath: string;
}

interface TwitchTokens {
    accessToken: string;
    refreshToken?: string | null;
    expiresIn: number;
    obtainmentTimestamp: number;
}

// --- THE CLIENT CLASS ---
export class TwitchApiClient {
    private static readonly API_BASE_URL = 'https://api.twitch.tv/helix';
    private static readonly AUTH_BASE_URL = 'https://id.twitch.tv/oauth2';

    private config: TwitchApiConfig;
    private userTokens: TwitchTokens | null = null;
    private appTokens: TwitchTokens | null = null;

    private constructor(config: TwitchApiConfig) {
        this.config = config;
        console.log(TwitchApiClient.API_BASE_URL)
    }

    /**
     * Asynchronously creates and initializes a client capable of managing both
     * User and App Access Tokens simultaneously.
     */
    public static async create(): Promise<TwitchApiClient> {
        const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
        const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
        const DATA_DIR = process.env.DATA_DIR;

        if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !DATA_DIR) {
            throw new Error('Missing one or more required environment variables: TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, DATA_DIR');
        }

        const resolvedDataDir = path.resolve(process.cwd(), DATA_DIR);

        const config: TwitchApiConfig = {
            clientId: TWITCH_CLIENT_ID,
            clientSecret: TWITCH_CLIENT_SECRET,
            userTokenPath: path.join(resolvedDataDir, 'user_token.json'),
            appTokenPath: path.join(resolvedDataDir, 'app_token.json'),
        };

        const client = new TwitchApiClient(config);
        await client.initializeTokens();
        return client;
    }

    private async initializeTokens(): Promise<void> {
        try {
            const userTokenData = await fs.readFile(this.config.userTokenPath, 'utf-8');
            this.userTokens = JSON.parse(userTokenData);
        } catch {
            console.warn(`User token file not found at ${this.config.userTokenPath}. Scoped calls will fail until a token is generated.`);
        }
        try {
            await fs.access(this.config.appTokenPath);
        } catch {
            console.log('App token file not found, creating new one...');
            await this.fetchAppAccessToken();
        }
            const appTokenData = await fs.readFile(this.config.appTokenPath, 'utf-8');
            this.appTokens = JSON.parse(appTokenData);
    }

    // --- TOKEN MANAGEMENT ---
    private isTokenExpired(token: TwitchTokens | null): boolean {
        if (!token) return true;
        const expiresInMilliseconds = (token.expiresIn - 60) * 1000;
        return Date.now() > token.obtainmentTimestamp + expiresInMilliseconds;
    }

    private async writeTokens(type: TokenType, tokens: TwitchTokens): Promise<void> {
        const filePath = type === 'user' ? this.config.userTokenPath : this.config.appTokenPath;
        if (type === 'user') this.userTokens = tokens;
        else this.appTokens = tokens;
        await fs.writeFile(filePath, JSON.stringify(tokens, null, 2), 'utf-8');
    }

    private async getValidAccessToken(type: TokenType): Promise<string> {
        const tokenState = type === 'user' ? this.userTokens : this.appTokens;

        if (this.isTokenExpired(tokenState)) {
            if (type === 'user') {
                await this.refreshUserAccessToken();
            } else { // 'app'
                await this.fetchAppAccessToken();
            }
        }
        // After refresh/fetch, the token state is updated, so we can safely return the access token.
        return (type === 'user' ? this.userTokens! : this.appTokens!).accessToken;
    }

    private async fetchAppAccessToken(): Promise<void> {
        console.log('Fetching new App Access Token...');
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            grant_type: 'client_credentials',
        });
        const response = await fetch(`${TwitchApiClient.AUTH_BASE_URL}/token`, { method: 'POST', body: params });
        if (!response.ok) throw new Error(`Failed to fetch App Access Token: ${await response.text()}`);
        const newTokens = await response.json();
        await this.writeTokens('app', {
            accessToken: newTokens.access_token,
            expiresIn: newTokens.expires_in,
            obtainmentTimestamp: Date.now(),
        });
        console.log('App Access Token fetched and saved.');
    }

    private async refreshUserAccessToken(): Promise<void> {
        if (!this.userTokens?.refreshToken) throw new Error('Cannot refresh user token: No refresh token found.');
        console.log('Refreshing User Access Token...');
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: this.userTokens.refreshToken,
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
        });
        const response = await fetch(`${TwitchApiClient.AUTH_BASE_URL}/token`, { method: 'POST', body: params });
        if (!response.ok) throw new Error(`Failed to refresh User Access Token: ${await response.text()}`);
        const newTokens = await response.json();
        await this.writeTokens('user', {
            accessToken: newTokens.access_token,
            refreshToken: newTokens.refresh_token,
            expiresIn: newTokens.expires_in,
            obtainmentTimestamp: Date.now(),
        });
        console.log('User Access Token refreshed and saved.');
    }

    // --- GENERIC API REQUEST HANDLER ---
    private async makeApiRequest<T>(endpoint: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: object, tokenType: TokenType = 'user'): Promise<T> {
        const accessToken = await this.getValidAccessToken(tokenType);
        const url = `${TwitchApiClient.API_BASE_URL}/${endpoint}`;
        const headers = { 'Authorization': `Bearer ${accessToken}`, 'Client-Id': this.config.clientId, 'Content-Type': 'application/json' };
        const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
        if (!response.ok) throw new Error(`Twitch API Error: ${response.status} - ${await response.text()}`);
        if (response.status === 204) return null as T;
        return (await response.json()) as T;
    }

    // --- PUBLIC API METHODS ---
    // Note how each method now specifies the token type required for its internal call.

    public async listEventSubSubscriptions(status?: string): Promise<{ data: EventSubSubscription[] }> {
        const endpoint = status ? `eventsub/subscriptions?status=${status}` : 'eventsub/subscriptions';
        // REQUIRES APP TOKEN
        return this.makeApiRequest(endpoint, 'GET', undefined, 'app');
    }

    public async createEventSubSubscription(
        type: string, 
        version: string, 
        condition: Record<string, string>, 
        callbackUrl: string
    ): Promise<{ data: EventSubSubscription[] }> {
        const body = {
            type,
            version,
            condition,
            transport: {
                method: "webhook",
                callback: callbackUrl,
                secret: process.env.EVENTSUB_SECRET || 'default_secret'
            },
        };
        // REQUIRES USER TOKEN for scoped subscriptions, and benefits from user rate limits
        return this.makeApiRequest('eventsub/subscriptions', 'POST', body, 'user');
    }

    public async deleteEventSubSubscription(id: string): Promise<void> {
        // REQUIRES APP TOKEN
        await this.makeApiRequest(`eventsub/subscriptions?id=${id}`, 'DELETE', undefined, 'app');
    }

    public async getUserFromId(id: string): Promise<{ data: TwitchUser[] | null }> {
        if (!id) return { data: null };
        // Defaults to USER TOKEN for higher rate limits
        return this.makeApiRequest(`users?id=${encodeURIComponent(id)}`);
    }

    public async getUserFromName(login: string): Promise<{ data: TwitchUser[] | null }> {
        if (!login) return { data: null };
        // Defaults to USER TOKEN for higher rate limits
        return this.makeApiRequest(`users?login=${encodeURIComponent(login)}`);
    }

    public async getStream(broadcasterId: string): Promise<{ data: TwitchStream[] | null }> {
        if (!broadcasterId) return { data: null };
        // Defaults to USER TOKEN for higher rate limits
        return this.makeApiRequest(`streams?user_id=${encodeURIComponent(broadcasterId)}`);
    }
}