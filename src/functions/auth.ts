import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { EnvPortAdapter, EventSubHttpListener } from '@twurple/eventsub-http';
import { NgrokAdapter } from '@twurple/eventsub-ngrok';

const auth = async () => {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  const authProvider = new AppTokenAuthProvider(clientId, clientSecret);

  const apiClient = new ApiClient({ authProvider });

  console.log('API client created');
  console.log(`Hostname: ${process.env.HOSTNAME}`);

  // create adapter based on environment
  let adapter;

  if (process.env.NODE_ENV === 'development') {
    await apiClient.eventSub.deleteAllSubscriptions();

    adapter = new NgrokAdapter({
      ngrokConfig: {
        authtoken: process.env.NGROK_AUTH_TOKEN
      }
    });
  } else {
    if (!process.env.HOSTNAME) {
      return console.error('No hostname provided');
    }

    adapter = new EnvPortAdapter({
      hostName: process.env.HOSTNAME
    });
  }
  const listener = new EventSubHttpListener({
    apiClient,
    adapter,
    secret: process.env.EVENTSUB_SECRET
  });

  return { listener, apiClient };
};

export default auth;
