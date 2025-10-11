import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envFile = process.env.NODE_ENV === 'development' ? '.env.dev' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile), quiet: true });

import { TwitchApiClient } from './functions/auth.js';
import { createServer } from './functions/server.js';
//auth user with twitch api
const client = await TwitchApiClient.create();

const server = createServer();

server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});

//read channels.json from data directory
const dataDir = process.env.DATA_DIR || './data';
const channelsFile = process.env.NODE_ENV === 'development' ? 'channels.dev.json' : 'channels.json';
const channelsPath = path.resolve(process.cwd(), dataDir, channelsFile);
if (!fs.existsSync(channelsPath)) {
  console.error(`Channels file not found at ${channelsPath}`);
  process.exit(1);
}
const channels: string[] = JSON.parse(fs.readFileSync(channelsPath, 'utf-8'));
const callbackUrl = process.env.NODE_ENV === 'development' ? `http://localhost:${process.env.PORT || 3000}/events/twitch` : `https://${process.env.HOSTNAME}/events/twitch`;

for (const channel of channels) {
  const userResult = await client.getUserFromName(channel);
  const user = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data;
  if (!user) {
    console.error(`User not found: ${channel}`);
    continue;
  }
  await client.createEventSubSubscription(
    'stream.online',
    '1',
    { broadcaster_user_id: user.id },
    callbackUrl
  );
  console.log(`Created subscription for ${user.display_name}`);
}

//wait for 30 seconds
setTimeout(async () => {
  const { data } = await client.listEventSubSubscriptions();
  console.log('Current subscriptions:', data.length);
  data.map(sub => {
    console.log(`Subscription ID: ${sub.id}, Type: ${sub.type}, Status: ${sub.status}, Condition: ${JSON.stringify(sub.condition)}`);
  });
}, 30000);



