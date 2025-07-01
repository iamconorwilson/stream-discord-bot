import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { EventSubHttpListener, EventSubMiddleware } from '@twurple/eventsub-http';
import { NgrokAdapter } from '@twurple/eventsub-ngrok';
import express from 'express';

// TYPES
import type { Express } from 'express';
import type { IRouter } from 'express-serve-static-core';

const createApiClient = () => {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing Twitch client credentials');
  const authProvider = new AppTokenAuthProvider(clientId, clientSecret);
  return new ApiClient({ authProvider });
};

const setupDevelopmentListener = async (apiClient: ApiClient) => {
  await apiClient.eventSub.deleteAllSubscriptions();
  const adapter = new NgrokAdapter({
    ngrokConfig: {
      authtoken: process.env.NGROK_AUTH_TOKEN
    }
  });
  const listener = new EventSubHttpListener({
    apiClient,
    adapter,
    secret: process.env.EVENTSUB_SECRET
  });
  return { listener, apiClient };
};

const setupProductionListener = async (apiClient: ApiClient) => {
  if (!process.env.HOSTNAME) throw new Error('No hostname provided');
  const app: Express = express();
  const listener = new EventSubMiddleware({
    apiClient,
    hostName: process.env.HOSTNAME,
    secret: process.env.EVENTSUB_SECRET,
    pathPrefix: '/twitch'
  });

  listener.apply(app as unknown as IRouter);

  app.get('/health', (req, res) => {res.status(200).send('OK')});

  await new Promise<void>((resolve) => {
    app.listen(process.env.PORT || 3000, async () => {
      await listener.markAsReady();
      console.log(`Server is running on port ${process.env.PORT || 3000}`);
      resolve();
    });
  });

  return { listener, apiClient };
};

const auth = async () => {
  const apiClient = createApiClient();
  console.log('API client created');

  if (process.env.NODE_ENV === 'development') {
    return await setupDevelopmentListener(apiClient);
  } else {
    return await setupProductionListener(apiClient);
  }
};

export default auth;