import crypto from 'crypto';

// --- TYPES ---
interface TwitchApiConfig {
    clientId: string;
    clientSecret: string;
}

interface TwitchToken {
    accessToken: string;
    expiresIn: number;
    obtainmentTimestamp: number;
}

// --- TWITCH CLIENT CLASS ---
export class TwitchApiClient {
    private static readonly API_BASE_URL = 'https://api.twitch.tv/helix';
    private static readonly AUTH_BASE_URL = 'https://id.twitch.tv/oauth2';

    private static instance: TwitchApiClient | null = null;
    private static instancePromise: Promise<TwitchApiClient> | null = null;

    private config: TwitchApiConfig;
    private appToken: TwitchToken | null = null;
    private secret: string = process.env.EVENTSUB_SECRET || crypto.randomBytes(32).toString('hex');

    private constructor(config: TwitchApiConfig) {
        this.config = config;
        console.log(TwitchApiClient.API_BASE_URL);
    }

    // --- SINGLETON INSTANCE ---
    public static async getInstance(): Promise<TwitchApiClient> {
        if (TwitchApiClient.instance) {
            return TwitchApiClient.instance;
        }
        if (TwitchApiClient.instancePromise) {
            return TwitchApiClient.instancePromise;
        }
        TwitchApiClient.instancePromise = (async () => {
            const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
            const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

            if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
                throw new Error('Missing one or more required environment variables: TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET');
            }

            const config: TwitchApiConfig = {
                clientId: TWITCH_CLIENT_ID,
                clientSecret: TWITCH_CLIENT_SECRET,
            };

            const client = new TwitchApiClient(config);
            await client.initializeTokens();
            TwitchApiClient.instance = client;
            return client;
        })();
        return TwitchApiClient.instancePromise;
    }

    private async initializeTokens(): Promise<void> {
        await this.fetchAppAccessToken();
    }

    // --- TOKEN MANAGEMENT ---
    private isTokenExpired(token: TwitchToken | null): boolean {
        if (!token) return true;
        const expiresInMilliseconds = (token.expiresIn - 60) * 1000;
        return Date.now() > token.obtainmentTimestamp + expiresInMilliseconds;
    }

    private async getValidAccessToken(): Promise<string> {
        if (this.isTokenExpired(this.appToken)) {
            await this.fetchAppAccessToken();
        }
        return this.appToken!.accessToken;
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
        this.appToken = {
            accessToken: newTokens.access_token,
            expiresIn: newTokens.expires_in,
            obtainmentTimestamp: Date.now(),
        };
        console.log('App Access Token fetched and stored in memory.');
    }

    // --- GENERIC API REQUEST HANDLER ---
    private async makeApiRequest<T>(endpoint: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: object): Promise<T> {
        const accessToken = await this.getValidAccessToken();
        const url = `${TwitchApiClient.API_BASE_URL}/${endpoint}`;
        const headers = { 'Authorization': `Bearer ${accessToken}`, 'Client-Id': this.config.clientId, 'Content-Type': 'application/json' };
        const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
        if (!response.ok) throw new Error(`Twitch API Error: ${response.status} - ${await response.text()}`);
        if (response.status === 204) return null as T;
        return (await response.json()) as T;
    }

    // --- PUBLIC API METHODS ---
    public async listEventSubSubscriptions(status?: string): Promise<{ data: EventSubSubscription[] }> {
        const endpoint = status ? `eventsub/subscriptions?status=${status}` : 'eventsub/subscriptions';
        return this.makeApiRequest(endpoint, 'GET');
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
                secret: this.secret
            },
        };
        return this.makeApiRequest('eventsub/subscriptions', 'POST', body);
    }

    public async deleteEventSubSubscription(id: string): Promise<void> {
        await this.makeApiRequest(`eventsub/subscriptions?id=${id}`, 'DELETE');
    }

    public async verifyTwitchSignature(
        messageId: string,
        timestamp: string,
        body: Buffer,
        providedSignature: string
    ): Promise<boolean> {
        const hmac = crypto.createHmac('sha256', this.secret);
        hmac.update(messageId);
        hmac.update(timestamp);
        hmac.update(body);
        const computedSignature = `sha256=${hmac.digest('hex')}`;
        return crypto.timingSafeEqual(Buffer.from(computedSignature), Buffer.from(providedSignature));
    }

    public async getUserFromId(id: string): Promise<{ data: TwitchUser[] | null }> {
        if (!id) return { data: null };
        return this.makeApiRequest(`users?id=${encodeURIComponent(id)}`);
    }

    public async getUserFromName(login: string): Promise<{ data: TwitchUser[] | null }> {
        if (!login) return { data: null };
        return this.makeApiRequest(`users?login=${encodeURIComponent(login)}`);
    }

    public async getStream(broadcasterId: string): Promise<{ data: TwitchStream[] | null }> {
        if (!broadcasterId) return { data: null };
        return this.makeApiRequest(`streams?user_id=${encodeURIComponent(broadcasterId)}`);
    }
}