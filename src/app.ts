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
import { TwitchApiClient } from './functions/auth/twitch/auth.js';
import { createServer } from './functions/server.js';
import { createOnlineSubscription, deleteAllSubscriptions, listSubscriptions } from './functions/auth/twitch/subscriptions.js';
import { createKickSubscription, deleteAllKickSubscriptions, listKickSubscriptions } from './functions/auth/kick/subscriptions.js';
import { KickApiClient } from './functions/auth/kick/auth.js';

// Initialize Twitch API client
const client = await TwitchApiClient.getInstance();

// Start Express server
const server = createServer();
server.listen(3000, () => {
  const serverUrl = process.env.NODE_ENV === 'development' ? `http://${process.env.HOSTNAME || 'localhost'}:${process.env.PORT || 3000}` : `https://${process.env.HOSTNAME}`;
  console.log(`Server is running on ${serverUrl}`);
});

interface ChannelsConfig {
  twitch?: string[];
  kick?: string[];
}
let channels: ChannelsConfig = { twitch: [], kick: [] };

if (process.env.NODE_ENV !== 'development') {

  // Clear existing subscriptions to avoid duplicates
  try {
    const count = await deleteAllSubscriptions();
    console.log(`Deleted ${count} existing Twitch subscriptions`);
  } catch (err: any) {
    console.warn(`Failed to delete existing Twitch subscriptions: ${err.message}`);
  }

  try {
    const count = await deleteAllKickSubscriptions();
    console.log(`Deleted ${count} existing Kick subscriptions`);
  } catch (err: any) {
    console.warn(`Failed to delete existing Kick subscriptions: ${err.message}`);
  }

  // Load channels from configuration file
  const dataDir = process.env.DATA_DIR || './data';
  const channelsPath = path.resolve(process.cwd(), dataDir, 'channels.json');
  if (!fs.existsSync(channelsPath)) {
    console.error(`Channels file not found at ${channelsPath}`);
    process.exit(1);
  }
  channels = JSON.parse(fs.readFileSync(channelsPath, 'utf-8'));

  // Create subscriptions for each Twitch channel
  if (channels.twitch) {
    for (const channel of channels.twitch) {
      const userResult = await client.getUserFromName(channel);
      const user = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data;
      if (!user) {
        console.error(`[Twitch] User not found: ${channel}`);
        continue;
      }
      await createOnlineSubscription(user.id);
      console.log(`[Twitch] Created subscription for ${channel}`);
    }
  }

  // Create subscriptions for each Kick channel
  if (channels.kick) {
    const kickClient = await KickApiClient.getInstance();
    for (const channel of channels.kick) {
      const channelData = await kickClient.getChannel(channel);
      const userId = channelData?.broadcaster_user_id;
      if (!userId) {
        console.error(`[Kick] User not found: ${channel}`);
        continue;
      }
      await createKickSubscription(userId);
      console.log(`[Kick] Created subscription for ${channel} (ID: ${userId})`);
    }
  }
} else {
  console.log('Development mode: Skipping subscription setup.');
}

// List current subscriptions after a delay to ensure they are set up
setTimeout(async () => {
  try {
    const subs = await listSubscriptions();
    console.log('Current Twitch subscriptions:', subs.length);
    const expectedTwitchSubs = channels.twitch?.length || 0;
    if (subs.length < expectedTwitchSubs && process.env.NODE_ENV !== 'development') {
      console.warn('Warning: Some Twitch subscriptions may not have been created successfully.');
    }
  } catch (error: any) {
    console.warn('Could not list Twitch subscriptions:', error.message);
  }

  try {
    const kickSubs = await listKickSubscriptions();
    console.log('Current Kick subscriptions:', kickSubs.length);
    const expectedKickSubs = channels.kick?.length || 0;
    if (kickSubs.length < expectedKickSubs && process.env.NODE_ENV !== 'development') {
      console.warn('Warning: Some Kick subscriptions may not have been created successfully.');
    }
  } catch (error: any) {
    console.warn('Could not list Kick subscriptions:', error.message);
  }
}, 30000);



