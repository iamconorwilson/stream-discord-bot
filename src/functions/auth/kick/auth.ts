import crypto from 'crypto';

interface KickApiConfig {
  clientId: string;
  clientSecret: string;
}

interface KickToken {
  accessToken: string;
  expiresIn: number;
  obtainmentTimestamp: number;
}

export class KickApiClient {
  private static readonly API_BASE_URL = 'https://api.kick.com/public/v1';
  private static readonly AUTH_BASE_URL = 'https://id.kick.com';

  private static instance: KickApiClient | null = null;
  private static instancePromise: Promise<KickApiClient> | null = null;

  private config: KickApiConfig;
  private appToken: KickToken | null = null;
  private publicKey: string | null = null;

  private constructor(config: KickApiConfig) {
    this.config = config;
  }

  public static async getInstance(): Promise<KickApiClient> {
    if (KickApiClient.instance) return KickApiClient.instance;
    if (KickApiClient.instancePromise) return KickApiClient.instancePromise;
    KickApiClient.instancePromise = (async () => {
      const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID;
      const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;

      if (!KICK_CLIENT_ID || !KICK_CLIENT_SECRET) {
        console.warn('[Kick] Missing Kick credentials. Kick integrations disabled.');
        const client = new KickApiClient({ clientId: '', clientSecret: '' });
        KickApiClient.instance = client;
        return client;
      }

      const client = new KickApiClient({
        clientId: KICK_CLIENT_ID,
        clientSecret: KICK_CLIENT_SECRET,
      });

      try {
        await client.initialize();
      } catch (err) {
        console.error("[Kick] Failed to initialize KickApiClient:", err);
      }
      KickApiClient.instance = client;
      return client;
    })();
    return KickApiClient.instancePromise;
  }

  private async initialize(): Promise<void> {
    await this.fetchPublicKey();
    // Try getting a valid token eagerly
    try {
      await this.getValidAccessToken();
    } catch (e) {
      console.error("[Kick] Failed to get Kick app access token on init", e);
    }
  }

  // --- APP ACCESS TOKEN FLOW ---
  private async fetchAppAccessToken(): Promise<void> {
    console.log('[Kick] Fetching new App Access Token...');
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch(`${KickApiClient.AUTH_BASE_URL}/oauth/token`, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!response.ok) {
      throw new Error(`[Kick] Failed to fetch App Access Token: ${await response.text()}`);
    }

    const tokens = await response.json();
    this.appToken = {
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      obtainmentTimestamp: Date.now()
    };
    console.log('[Kick] App Access Token fetched and stored in memory.');
  }

  private isTokenExpired(token: KickToken | null): boolean {
    if (!token) return true;
    const expiresInMilliseconds = (token.expiresIn - 60) * 1000;
    return Date.now() > token.obtainmentTimestamp + expiresInMilliseconds;
  }

  public get isAuthenticated(): boolean {
    return this.appToken !== null && !this.isTokenExpired(this.appToken);
  }

  private async getValidAccessToken(): Promise<string> {
    if (this.isTokenExpired(this.appToken)) {
      await this.fetchAppAccessToken();
      if (!this.appToken) {
        throw new Error("[Kick] Failed to acquire App Access Token.");
      }
    }
    return this.appToken!.accessToken;
  }

  private async fetchPublicKey(): Promise<void> {
    console.log('[Kick] Fetching Kick Public Key...');
    const response = await fetch('https://api.kick.com/public/v1/public-key');
    if (!response.ok) return;
    const text = await response.text();
    this.publicKey = text.trim();
  }

  public async makeApiRequest<T>(endpoint: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: object): Promise<T> {
    if (!this.config.clientId) throw new Error('Kick config not set');
    const accessToken = await this.getValidAccessToken();
    const url = endpoint.startsWith('http') ? endpoint : `${KickApiClient.API_BASE_URL}/${endpoint}`;

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const response = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) throw new Error(`Kick API Error: ${response.status} - ${await response.text()}`);
    if (response.status === 204) return null as T;
    return (await response.json()) as T;
  }

  public async getChannel(identifier: string | number): Promise<any | null> {
    try {
      // Try official authenticated channel endpoint
      const queryParam = (typeof identifier === 'string' && isNaN(Number(identifier)))
        ? `slug=${encodeURIComponent(identifier)}`
        : `broadcaster_user_id=${encodeURIComponent(identifier)}`;

      const response = await this.makeApiRequest(`channels?${queryParam}`);

      if (response && (response as any).data && Array.isArray((response as any).data)) {
        return (response as any).data[0] || null;
      }
      return response;
    } catch (err) {
      console.warn(`[Kick] Error fetching channel info for ${identifier}`, err);
      return null;
    }
  }

  public async getUser(identifier: string): Promise<any | null> {
    try {
      // Official authenticated users endpoint
      return await this.makeApiRequest(`users?id=${encodeURIComponent(identifier)}`);
    } catch (err) {
      console.error(`[Kick] Error fetching user info for ${identifier}:`, err);
      return null;
    }
  }

  public async createEventSubSubscription(
    broadcasterId: number
  ): Promise<any> {
    const actualBody = {
      broadcaster_user_id: broadcasterId,
      events: [{ name: "events:subscribe", version: 1 }],
      method: "webhook"
    };
    return this.makeApiRequest('events/subscriptions', 'POST', actualBody);
  }

  public async listEventSubSubscriptions(): Promise<any> {
    return this.makeApiRequest('events/subscriptions', 'GET');
  }

  public async deleteEventSubSubscription(id: string): Promise<void> {
    await this.makeApiRequest(`events/subscriptions/${id}`, 'DELETE');
  }

  public verifyKickSignature(
    messageId: string,
    timestamp: string,
    body: string,
    providedSignature: string
  ): boolean {
    if (!this.publicKey) return false;
    const dataToSign = `${messageId}.${timestamp}.${body}`;
    const verify = crypto.createVerify('SHA256');
    verify.update(dataToSign);
    return verify.verify(this.publicKey, providedSignature, 'base64');
  }
}
