import { TwitchApiClient } from "./auth.js";

let client: TwitchApiClient | null = null;

// Get Client instance, initializing if necessary
const getClient = async (): Promise<TwitchApiClient> => {
  if (!client) {
    client = await TwitchApiClient.getInstance();
  }
  return client;
};

// --- SUBSCRIPTION MANAGEMENT ---
export const createOnlineSubscription = async (broadcasterId: string): Promise<EventSubSubscription[]> => {
  const client = await getClient();
  const callbackUrl = process.env.NODE_ENV === 'development' ? `http://localhost:${process.env.PORT || 3000}/events/twitch` : `https://${process.env.HOSTNAME}/events/twitch`;
  const sub = await client.createEventSubSubscription(
    'stream.online',
    '1',
    { broadcaster_user_id: broadcasterId },
    callbackUrl
  );
  return sub.data;
};

export const listSubscriptions = async (): Promise<EventSubSubscription[]> => {
  const client = await getClient();
  const subs = await client.listEventSubSubscriptions();
  return subs.data;
};

export const deleteSubscription = async (subscriptionId: string): Promise<void> => {
  const client = await getClient();
  await client.deleteEventSubSubscription(subscriptionId);
};

export const deleteAllSubscriptions = async (): Promise<number> => {
  const client = await getClient();
  const { data: existingSubscriptions } = await client.listEventSubSubscriptions();
  if (existingSubscriptions && existingSubscriptions.length > 0) {
    await Promise.all(existingSubscriptions.map(sub => client.deleteEventSubSubscription(sub.id)));
  }
  return existingSubscriptions ? existingSubscriptions.length : 0;
};
