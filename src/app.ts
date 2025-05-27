import { readFileSync, existsSync } from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

// FUNCTIONS
import auth from './functions/auth.js';
import sendWebhook from './functions/message.js';

// TYPES
import type { HelixUser } from '@twurple/api';

if (process.env.NODE_ENV === 'development') {
  dotenv.config({ path: '.env.development' });
} else {
  dotenv.config();
}
console.log('Starting TwitchBot');

console.log(process.env.NODE_ENV);

const channelsPath = path.resolve(process.cwd(), process.env.CHANNELS_PATH);

//if channels.json does not exist, error
if (!existsSync(channelsPath)) {
  console.error('No channels.json found. Please create one.');
  console.log(channelsPath);
  process.exit(1);
}

let channels: string[];

let sentMessages: string[] = [];

try {
  const parsedChannels = JSON.parse(readFileSync(channelsPath, 'utf-8'));
  if (
    Array.isArray(parsedChannels) &&
    parsedChannels.every((item) => typeof item === 'string')
  ) {
    channels = parsedChannels;
  } else {
    throw new Error(
      'Invalid channels.json format. Expected an array of strings.'
    );
  }
} catch (error) {
  console.error('Failed to parse channels.json:', error);
  process.exit(1);
}

const authResult = await auth();

if (!authResult) {
  console.error('Failed to authenticate');
  process.exit(1);
}

const { listener, apiClient } = authResult;

//Delete any existing subscriptions
console.log('Deleting any existing subscriptions');
await apiClient.eventSub.deleteAllSubscriptions();

console.log('Registering channels');

for (const channel of channels) {
  let channelId;

  try {
    channelId = await apiClient.users
      .getUserByName(channel)
      .then((user: HelixUser | null) => {
        if (user) {
          return user.id;
        } else {
          throw new Error(`User ${channel} not found`);
        }
      });
  } catch (error) {
    console.error(`Failed to get channel ID for ${channel}`);
    console.error(error);
    continue;
  }

  console.log(`Registering channel: ${channel} (${channelId})`);

  listener.onStreamOnline(channelId, async (event) => {
    if (sentMessages.includes(event.id)) {
      console.log(`Message already sent for ${event.broadcasterDisplayName}`);
      return;
    }
    console.log(`Stream is online for ${event.broadcasterDisplayName} - ${event.id}`);
    await sendWebhook(event);
    sentMessages.push(event.id);
  });
}

//set timeout to clear sentMessages every 24 hours
setInterval(() => {
  console.log('Clearing sent messages');
  sentMessages = [];
}, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

console.log('Listening for events');

listener.start();
