import express from 'express';
import type { Express, Request, Response } from 'express';
import { sendMessage } from './message.js';

const createServer = (): Express => {
  const app = express();

  app.use(express.json());

  // endpoint to receive webhooks from twitch
  app.post('/events/twitch', (req: Request, res: Response) => {
    const { body, headers } = req;
    if (headers['twitch-eventsub-message-type'] === 'webhook_callback_verification') {
      console.log('Subscription verification request:', body.subscription.id);
      const challenge = body.challenge;
      return res.status(200).send(challenge);
    }
    if (headers['twitch-eventsub-message-type'] === 'revocation') {
      console.log('Revocation request:', body.subscription.id);
      return res.status(200).end();
    }
    if (headers['twitch-eventsub-message-type'] === 'notification') {
      const broadcasterId = body.event.broadcaster_user_id;
      console.log(`Received notification for broadcaster ID ${broadcasterId}`);
      res.status(200).end();
      sendMessage(broadcasterId);
      return;
    }
    console.log('Unknown message type:', headers['twitch-eventsub-message-type']);
    return res.status(200).send('Listening for Twitch events');
  });

  app.get('/health', (req: Request, res: Response) => {
    res.status(200).send('OK');
  });

  app.get('/', (req: Request, res: Response) => {
    res.redirect('https://no-oj.com');
  });

  return app;
};

export { createServer };