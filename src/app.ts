import { readFileSync, existsSync } from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

// FUNCTIONS
import auth from './functions/auth.js';
import sendWebhook from './functions/message.js';
import { deleteAllSubscriptions, getAllSubscriptions } from './functions/cleanup.js';

// TYPES
import type { HelixUser } from '@twurple/api';
import type { EventSubStreamOnlineEvent } from '@twurple/eventsub-base';
import type { EventSubHttpListener } from '@twurple/eventsub-http';

// ENV
dotenv.config({
  quiet: true,
  path: process.env.NODE_ENV === 'development' ? '.env.development' : '.env'
})

console.log('-- Starting TwitchBot');

console.log(`Environment: ${(process.env.NODE_ENV || 'production').toUpperCase()}`);

const channelsPath = path.resolve(process.cwd(), process.env.CHANNELS_PATH);

//if channels.json does not exist, error
if (!existsSync(channelsPath)) {
  console.error('No channels.json found. Please create one.');
  console.log(channelsPath);
  process.exit(1);
}

let channels: string[];

let sentMessages: string[] = [];

const queue: object[] = [];
let isProcessing: boolean = false;

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
console.log('-- Deleting any existing subscriptions');
await deleteAllSubscriptions(apiClient);

console.log('-- Registering channels');

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

  

  const evt = listener.onStreamOnline(channelId, async (event) => {
    queue.push(event);
    if (queue.length === 1 && !isProcessing) {
      processQueue();
    }
  });

  console.log(`Registered channel: ${channel} [${channelId}] - Verified: ${evt.verified}`);

  if (process.env.NODE_ENV === 'development' || channel === channels[0]) {
    console.log(`CLI Test Command for ${channel}:`);
    console.log(await evt.getCliTestCommand());
  }
}

//Check that all channels are registered
const registeredChannels = await getAllSubscriptions(apiClient);
console.log(`-- Total registered channels: ${registeredChannels.length} of ${channels.length}`);
for (const sub of registeredChannels) {
  console.log(`${sub.id} (${sub.status})`);
}

const processQueue = async () => {
  while (queue.length > 0) {
    isProcessing = true;
    const event = queue.shift();
    if (event) {
      await processMessage(event as EventSubStreamOnlineEvent);
    }
  }
  isProcessing = false;
}

const processMessage = async (event: EventSubStreamOnlineEvent) => {
  if (sentMessages.includes(event.id)) {
    console.log(`Message already sent for ${event.broadcasterDisplayName}`);
    return;
  }
  console.log(`Stream is online for ${event.broadcasterDisplayName} - ${event.id}`);
  await sendWebhook(event);
  sentMessages.push(event.id);
}

//set timeout to clear sentMessages every 24 hours
setInterval(() => {
  console.log('-- Clearing sent messages');
  sentMessages = [];
}, 24 * 60 * 60 * 1000); // 24 hours in milliseconds


console.log('-- Listening for events');
if (process.env.NODE_ENV === 'development') {
  // Only call start if listener has the start method (EventSubHttpListener)
  if (typeof (listener as EventSubHttpListener).start === 'function') {
    (listener as EventSubHttpListener).start();
  } else {
    console.warn('Listener does not support start() method in this environment.');
  }
}
