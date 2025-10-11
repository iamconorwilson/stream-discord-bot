import express from 'express';
import type { Express, Request, Response } from 'express';
import { sendMessage } from './message.js';
import { TwitchApiClient } from './auth.js';

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
      sendMessage(broadcasterId);
      return;
    }
    if (headers['twitch-eventsub-message-type']) {
      console.warn('Received unhandled Twitch EventSub message:', headers['twitch-eventsub-message-type']);
      return res.status(200).end();
    }
    console.log('Unknown message type');
    return res.status(400).end();
  });

  // --- HEALTH CHECK & ROOT ---
  app.get('/events/twitch', (req: Request, res: Response) => {
    res.status(200).send('Twitch EventSub endpoint is running.');
  });

  app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('OK');
  });

  app.get('/', (req: Request, res: Response) => {
    res.redirect('https://no-oj.com');
  });

  return app;
};
