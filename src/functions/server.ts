import express from 'express';
import type { Express, Request, Response } from 'express';
import { sendMessage } from './message.js';
import { TwitchApiClient } from './auth/twitch/auth.js';
import { KickApiClient } from './auth/kick/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// --- EXPRESS SERVER SETUP ---
export const createServer = (): Express => {
  const app = express();

  app.use(express.raw({
    type: 'application/json'
  }));

  app.use('/assets', express.static(path.resolve(__dirname, '../../public')));

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
      console.log(`[Twitch] Received notification for broadcaster ID: ${broadcasterId}`);
      res.status(200).end();
      sendMessage('twitch', broadcasterId);
      return;
    }
    if (headers['twitch-eventsub-message-type']) {
      console.warn('[Twitch] Received unhandled Twitch EventSub message:', headers['twitch-eventsub-message-type']);
      return res.status(200).end();
    }
    console.log('[Twitch] Unknown message type');
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

    const body: KickLivestreamStatusUpdateEvent = JSON.parse(req.body.toString());
    const eventType = headers['kick-event-type'];

    if (eventType === 'livestream.status.updated' && body.is_live === true) {
      const broadcasterId = body.broadcaster.user_id;
      if (broadcasterId) {
        console.log(`[Kick] Received Kick notification for broadcaster ID: ${broadcasterId}`);
        res.status(200).end();
        sendMessage('kick', broadcasterId.toString());
        return;
      }
    } else if (eventType === 'livestream.status.updated' && body.is_live === false) {
      // Stream offline, do nothing
      return res.status(200).end();
    }

    console.log('[Kick] Received unhandled Kick EventSub message type:', eventType);
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

  app.get('/', (req: Request, res: Response) => {
    res.redirect('https://no-oj.com');
  });

  return app;
};
