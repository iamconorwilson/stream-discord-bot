import express from 'express';
import type { Express, Request, Response } from 'express';
import { sendMessage } from './message.js';
import { TwitchApiClient } from './auth/twitch/auth.js';
import { KickApiClient } from './auth/kick/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory PKCE store for Kick OAuth
const pkceStore = new Map<string, string>();

// --- EXPRESS SERVER SETUP ---
export const createServer = (): Express => {
  const app = express();

  app.use(express.raw({
    type: 'application/json'
  }));

  // --- TWITCH EVENTSUB WEBHOOK ---
  app.post('/events/twitch', async (req: Request, res: Response) => {
    const { headers } = req;

    const messageId = headers['twitch-eventsub-message-id'] as string;
    const timestamp = headers['twitch-eventsub-message-timestamp'] as string;
    const providedSignature = headers['twitch-eventsub-message-signature'] as string;

    if (!messageId || !timestamp || !providedSignature) {
      console.warn('Missing required headers for signature verification');
      return res.status(400).end();
    }
    const client = await TwitchApiClient.getInstance();
    const isValid = await client.verifyTwitchSignature(messageId, timestamp, req.body, providedSignature);

    if (!isValid) {
      console.warn('Invalid signature for Twitch EventSub request');
      return res.status(403).end();
    }

    const body = JSON.parse(req.body.toString());

    if (headers['twitch-eventsub-message-type'] === 'webhook_callback_verification') {
      const challenge = body.challenge;
      return res.status(200).send(challenge);
    }
    if (headers['twitch-eventsub-message-type'] === 'revocation') {
      console.log('Revocation request:', body.subscription.id);
      return res.status(200).end();
    }
    if (headers['twitch-eventsub-message-type'] === 'notification') {
      const broadcasterId = body.event.broadcaster_user_id;
      console.log(`Received notification for broadcaster ID: ${broadcasterId}`);
      res.status(200).end();
      sendMessage('twitch', broadcasterId);
      return;
    }
    if (headers['twitch-eventsub-message-type']) {
      console.warn('Received unhandled Twitch EventSub message:', headers['twitch-eventsub-message-type']);
      return res.status(200).end();
    }
    console.log('Unknown message type');
    return res.status(400).end();
  });

  // --- KICK EVENTSUB WEBHOOK ---
  app.post('/events/kick', async (req: Request, res: Response) => {
    const { headers } = req;

    const messageId = headers['kick-event-message-id'] as string;
    const timestamp = headers['kick-event-message-timestamp'] as string;
    const providedSignature = headers['kick-event-signature'] as string;

    if (!messageId || !timestamp || !providedSignature) {
      console.warn('Missing required headers for Kick signature verification');
      return res.status(400).end();
    }
    const client = await KickApiClient.getInstance();
    const isValid = client.verifyKickSignature(messageId, timestamp, req.body.toString(), providedSignature);

    if (!isValid) {
      console.warn('Invalid signature for Kick EventSub request');
      return res.status(403).end();
    }

    const body = JSON.parse(req.body.toString());
    const eventType = headers['kick-event-type'];

    // For stream online, we look for livestream.status.updated or similar
    if (eventType === 'livestream.status.updated' || eventType === 'stream.started') {
      const broadcasterId = body.broadcaster_user_id || body.user_id || body.channel_id;
      if (broadcasterId) {
        console.log(`Received Kick notification for broadcaster ID: ${broadcasterId}`);
        res.status(200).end();
        sendMessage('kick', broadcasterId.toString());
        return;
      }
    }

    console.log('Received unhandled Kick EventSub message type:', eventType);
    return res.status(200).end();
  });

  // --- HEALTH CHECK & ROOT ---
  app.get('/events/twitch', (req: Request, res: Response) => {
    res.status(200).send('Twitch EventSub endpoint is running.');
  });
  app.get('/events/kick', (req: Request, res: Response) => {
    res.status(200).send('Kick EventSub endpoint is running.');
  });

  app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('OK');
  });

  // --- KICK OAUTH FLOW ---
  app.get('/dashboard', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../../public/dashboard.html'));
  });

  app.get('/login/kick', async (req: Request, res: Response) => {
    const secret = req.query.secret as string;
    if (!secret || secret !== process.env.OAUTH_DASHBOARD_SECRET) {
      return res.status(401).send('Unauthorized: Invalid dashboard secret.');
    }

    const client = await KickApiClient.getInstance();
    const callbackUrl = process.env.NODE_ENV === 'development' ? `http://localhost:${process.env.PORT || 3000}/callback/kick` : `https://${process.env.HOSTNAME}/callback/kick`;

    const { url, codeVerifier, state } = client.generateAuthUrl(callbackUrl, 'events:subscribe user:read channel:read');

    pkceStore.set(state, codeVerifier);

    // Clear out stored state after 10 minutes to prevent memory leaks
    setTimeout(() => pkceStore.delete(state), 10 * 60 * 1000);

    res.redirect(url);
  });

  app.get('/callback/kick', async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    if (error) {
      return res.status(400).send(`Auth Failed: ${error}`);
    }

    const codeVerifier = pkceStore.get(state);
    if (!codeVerifier) {
      return res.status(400).send('Auth Failed: Invalid or expired state parameter.');
    }

    pkceStore.delete(state);

    try {
      const client = await KickApiClient.getInstance();
      const callbackUrl = process.env.NODE_ENV === 'development' ? `http://localhost:${process.env.PORT || 3000}/callback/kick` : `https://${process.env.HOSTNAME}/callback/kick`;

      await client.exchangeCode(code, callbackUrl, codeVerifier);

      // Verify user ID against allowlist
      const userResponse = await client.makeApiRequest<any[]>('users');
      // Assuming GET /users returns the authenticated user data payload
      const userId = userResponse && userResponse.length > 0 ? userResponse[0].id : null;

      const allowlistStr = process.env.KICK_AUTH_ALLOWLIST || '';
      const allowlist = allowlistStr.split(',').map(id => id.trim());

      if (!userId || !allowlist.includes(userId.toString())) {
        console.warn(`Unauthorized Kick ID ${userId} attempted login.`);
        await client.revokeToken();
        return res.status(403).send('Access Denied: Your Kick User ID is not on the allowlist.');
      }

      res.send('Kick Authentication Successful! You may close this tab.');
    } catch (err: any) {
      console.error('Kick Callback Error:', err);
      res.status(500).send(`Auth Failed: ${err.message}`);
    }
  });

  app.get('/', (req: Request, res: Response) => {
    res.redirect('https://no-oj.com');
  });

  return app;
};
