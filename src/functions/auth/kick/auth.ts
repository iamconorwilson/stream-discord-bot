import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface KickApiConfig {
  clientId: string;
  clientSecret: string;
}

interface KickToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  obtainmentTimestamp: number;
}

export class KickApiClient {
  private static readonly API_BASE_URL = 'https://api.kick.com/public/v1';
  private static readonly AUTH_BASE_URL = 'https://id.kick.com';

  private static instance: KickApiClient | null = null;
  private static instancePromise: Promise<KickApiClient> | null = null;

  private config: KickApiConfig;
  private userToken: KickToken | null = null;
  private publicKey: string | null = null;
  private tokenFilePath: string;

  private constructor(config: KickApiConfig) {
    this.config = config;
    const dataDir = process.env.DATA_DIR || './data';
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.tokenFilePath = path.join(dataDir, 'kick.json');
    this.loadToken();
  }

  public static async getInstance(): Promise<KickApiClient> {
    if (KickApiClient.instance) return KickApiClient.instance;
    if (KickApiClient.instancePromise) return KickApiClient.instancePromise;
    KickApiClient.instancePromise = (async () => {
      const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID;
      const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET;

      if (!KICK_CLIENT_ID || !KICK_CLIENT_SECRET) {
        console.warn('Missing Kick credentials. Kick integrations disabled.');
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
        console.error("Failed to initialize KickApiClient:", err);
      }
      KickApiClient.instance = client;
      return client;
    })();
    return KickApiClient.instancePromise;
  }

  private async initialize(): Promise<void> {
    await this.fetchPublicKey();
  }

  // --- TOKEN STORAGE ---
  private loadToken() {
    if (fs.existsSync(this.tokenFilePath)) {
      try {
        const raw = fs.readFileSync(this.tokenFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.userToken = {
          accessToken: parsed.access_token,
          refreshToken: parsed.refresh_token,
          expiresIn: parsed.expires_in,
          obtainmentTimestamp: parsed.obtainment_timestamp
        };
      } catch (e) {
        console.error('Error parsing Kick token file:', e);
      }
    }
  }

  private saveToken(tokens: any) {
    const dataParams = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      obtainment_timestamp: Date.now()
    };
    this.userToken = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      obtainmentTimestamp: Date.now()
    };
    fs.writeFileSync(this.tokenFilePath, JSON.stringify(dataParams, null, 2));
  }

  private clearToken() {
    this.userToken = null;
    if (fs.existsSync(this.tokenFilePath)) {
      fs.unlinkSync(this.tokenFilePath);
    }
  }

  // --- OAUTH FLOW ---
  public generateAuthUrl(redirectUri: string, scopes: string): { url: string; codeVerifier: string; state: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    const url = `${KickApiClient.AUTH_BASE_URL}/oauth/authorize?${params.toString()}`;
    return { url, codeVerifier, state };
  }

  public async exchangeCode(code: string, redirectUri: string, codeVerifier: string): Promise<void> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: redirectUri,
      code: code,
      code_verifier: codeVerifier
    });

    const response = await fetch(`${KickApiClient.AUTH_BASE_URL}/oauth/token`, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!response.ok) {
      throw new Error(`Failed code exchange: ${await response.text()}`);
    }

    const tokens = await response.json();
    this.saveToken(tokens);
  }

  public async refreshToken(): Promise<void> {
    if (!this.userToken?.refreshToken) {
      console.warn("No refresh token available to refresh Kick auth.");
      return;
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.userToken.refreshToken
    });

    const response = await fetch(`${KickApiClient.AUTH_BASE_URL}/oauth/token`, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (!response.ok) {
      console.error(`Failed to refresh token: ${await response.text()}`);
      this.clearToken();
      return;
    }

    const tokens = await response.json();
    this.saveToken(tokens);
    console.log("Kick user access token refreshed successfully.");
  }

  public async revokeToken(): Promise<void> {
    if (!this.userToken?.accessToken) return;
    const params = new URLSearchParams({
      token: this.userToken.accessToken
    });

    try {
      await fetch(`${KickApiClient.AUTH_BASE_URL}/oauth/revoke`, {
        method: 'POST',
        body: params,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
    } catch (err) {
      console.error('Failed to revoke Kick token:', err);
    } finally {
      this.clearToken();
    }
  }

  private isTokenExpired(token: KickToken | null): boolean {
    if (!token) return true;
    const expiresInMilliseconds = (token.expiresIn - 60) * 1000;
    return Date.now() > token.obtainmentTimestamp + expiresInMilliseconds;
  }

  private async getValidAccessToken(): Promise<string> {
    if (!this.userToken) {
      throw new Error("No Kick user token found. Please authenticate via the dashboard.");
    }
    if (this.isTokenExpired(this.userToken)) {
      await this.refreshToken();
      if (!this.userToken) {
        throw new Error("Failed to refresh Kick token. Needs re-authentication.");
      }
    }
    return this.userToken.accessToken;
  }

  private async fetchPublicKey(): Promise<void> {
    console.log('Fetching Kick Public Key...');
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
      const official = await this.makeApiRequest(`channels/${encodeURIComponent(identifier)}`);
      return official;
    } catch (err) {
      console.warn(`Official Kick getChannel failed for ${identifier}, falling back to unauthenticated endpoint.`, err);
      try {
        const response = await fetch(`https://kick.com/api/v1/channels/${encodeURIComponent(identifier)}`);
        if (response.ok) return await response.json();
      } catch (e) { }
      return null;
    }
  }

  public async getUser(identifier: string | number): Promise<any | null> {
    try {
      // Official authenticated users endpoint
      return await this.makeApiRequest(`users/${encodeURIComponent(identifier)}`);
    } catch (err) {
      console.error(`Error fetching user info for ${identifier}:`, err);
      return null;
    }
  }

  public async createEventSubSubscription(
    broadcasterId: number,
    callbackUrl: string
  ): Promise<any> {
    const actualBody = {
      broadcaster_user_id: broadcasterId,
      events: [{ name: "events:subscribe", version: 1 }],
      method: "webhook",
      webhook: callbackUrl
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
