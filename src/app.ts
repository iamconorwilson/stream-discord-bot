import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envFile = process.env.NODE_ENV === 'development' ? '.env.dev' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile), quiet: true });

import { TwitchApiClient } from './functions/auth.js';
import { createServer } from './functions/server.js';
import { createOnlineSubscription, deleteAllSubscriptions, listSubscriptions } from './functions/subscriptions.js';

const client = await TwitchApiClient.create();

const server = createServer();
server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});

await deleteAllSubscriptions().then(() => {
  console.log('Deleted all existing subscriptions');
});

const dataDir = process.env.DATA_DIR || './data';
const channelsFile = process.env.NODE_ENV === 'development' ? 'channels.dev.json' : 'channels.json';
const channelsPath = path.resolve(process.cwd(), dataDir, channelsFile);
if (!fs.existsSync(channelsPath)) {
  console.error(`Channels file not found at ${channelsPath}`);
  process.exit(1);
}
const channels: string[] = JSON.parse(fs.readFileSync(channelsPath, 'utf-8'));

for (const channel of channels) {
  const userResult = await client.getUserFromName(channel);
  const user = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data;
  if (!user) {
    console.error(`User not found: ${channel}`);
    continue;
  }
  await createOnlineSubscription(user.id);
  console.log(`Created subscription for ${channel}`);
}

setTimeout(async () => {
  const subs = await listSubscriptions();
  console.log('Current subscriptions:', subs.length);
  if (subs.length < channels.length) {
    console.warn('Warning: Some subscriptions may not have been created successfully.');
  }
}, 30000);



