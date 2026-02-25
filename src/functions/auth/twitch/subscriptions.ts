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
export const createTwitchOnlineSubscription = async (broadcasterId: string): Promise<EventSubSubscription[]> => {
  const client = await getClient();
  if (!client.isAuthenticated) {
    console.warn("[Twitch] Cannot create subscription: Not authenticated.");
    return [];
  }
  const callbackUrl = process.env.NODE_ENV === 'development' ? `http://localhost:${process.env.PORT || 3000}/events/twitch` : `https://${process.env.HOSTNAME}/events/twitch`;
  const sub = await client.createEventSubSubscription(
    'stream.online',
    '1',
    { broadcaster_user_id: broadcasterId },
    callbackUrl
  );
  return sub.data;
};

export const listTwitchSubscriptions = async (): Promise<EventSubSubscription[]> => {
  const client = await getClient();
  if (!client.isAuthenticated) {
    console.warn("[Twitch] Cannot list subscriptions: Not authenticated.");
    return [];
  }
  const { data: subs } = await client.listEventSubSubscriptions();
  return subs || [];
};

export const deleteTwitchSubscription = async (subscriptionId: string): Promise<void> => {
  const client = await getClient();
  if (!client.isAuthenticated) {
    console.warn("[Twitch] Cannot delete subscription: Not authenticated.");
    return;
  }
  await client.deleteEventSubSubscription(subscriptionId);
};

export const deleteAllTwitchSubscriptions = async (): Promise<number> => {
  const client = await getClient();
  if (!client.isAuthenticated) {
    console.warn("[Twitch] Cannot delete subscriptions: Not authenticated.");
    return 0;
  }
  const { data: subs } = await client.listEventSubSubscriptions();
  if (subs && subs.length > 0) {
    await Promise.all(subs.map(sub => client.deleteEventSubSubscription(sub.id)));
  }
  return subs ? subs.length : 0;
};
