import express from 'express';

import type { Express, Request, Response } from 'express';

import {sendMessage} from './message.js';

const createServer = (): Express => {
  const app = express();

  app.use(express.json());

  // endpoint to receive webhooks from twitch
  app.post('/events/twitch', (req: Request, res: Response) => {
    if (req.headers['twitch-eventsub-message-type'] === 'webhook_callback_verification') {
      console.log('Subscription verification request:', req.body);
      const challenge = req.body.challenge;
      return res.status(200).send(challenge);
    }
    if (req.headers['twitch-eventsub-message-type'] === 'revocation') {
      console.log('Subscription revoked:', req.body);
      return res.status(200).end();
    }
    const broadcasterId = req.body.event.broadcaster_user_id;
    sendMessage(broadcasterId);

    res.status(200).end();
  });

  app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('OK');
  });

  return app;
};

export { createServer };