import { TwitchApiClient } from "./auth.js";

const client = await TwitchApiClient.create();

const callbackUrl = process.env.NODE_ENV === 'development' ? `http://localhost:${process.env.PORT || 3000}/events/twitch` : `https://${process.env.HOSTNAME}/events/twitch`;

export const createOnlineSubscription = async (broadcasterId: string): Promise<EventSubSubscription[]> => {
  const sub = await client.createEventSubSubscription(
    'stream.online',
    '1',
    { broadcaster_user_id: broadcasterId },
    callbackUrl
  );
  return sub.data;
};

export const listSubscriptions = async (): Promise<EventSubSubscription[]> => {
  const subs = await client.listEventSubSubscriptions();
  return subs.data;
};

export const deleteSubscription = async (subscriptionId: string): Promise<void> => {
  await client.deleteEventSubSubscription(subscriptionId);
};

export const deleteAllSubscriptions = async (): Promise<void> => {
  const { data: existingSubscriptions } = await client.listEventSubSubscriptions();
  await Promise.all(existingSubscriptions.map(sub => client.deleteEventSubSubscription(sub.id)));
};