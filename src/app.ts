import dotenv from 'dotenv';
import path from 'path';

// -- SETUP ENVIRONMENT VARIABLES --
if (process.env.NODE_ENV === 'development') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.dev'), quiet: true });
  console.log('Using environment file: .env.dev');
} else {
  dotenv.config({ quiet: true });
}
console.log('Starting application...');

// -- START SERVER --
import fs from 'fs';
import { TwitchApiClient } from './functions/auth.js';
import { createServer } from './functions/server.js';
import { createOnlineSubscription, deleteAllSubscriptions, listSubscriptions } from './functions/subscriptions.js';

// Initialize Twitch API client
const client = await TwitchApiClient.getInstance();

// Start Express server
const server = createServer();
server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});

let channels: string[] = [];

if (process.env.NODE_ENV !== 'development') {

  // Clear existing subscriptions to avoid duplicates
  await deleteAllSubscriptions().then((count) => {
    console.log(`Deleted ${count} existing subscriptions`);
  });
  
  // Load channels from configuration file
  const dataDir = process.env.DATA_DIR || './data';
  const channelsPath = path.resolve(process.cwd(), dataDir, 'channels.json');
  if (!fs.existsSync(channelsPath)) {
    console.error(`Channels file not found at ${channelsPath}`);
    process.exit(1);
  }
  channels = JSON.parse(fs.readFileSync(channelsPath, 'utf-8'));

  // Create subscriptions for each channel
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
} else {
  console.log('Development mode: Skipping subscription setup.');
}

// List current subscriptions after a delay to ensure they are set up
setTimeout(async () => {
  const subs = await listSubscriptions();
  console.log('Current subscriptions:', subs.length);
  if (subs.length < channels.length && process.env.NODE_ENV !== 'development') {
    console.warn('Warning: Some subscriptions may not have been created successfully.');
  }
}, 30000);



