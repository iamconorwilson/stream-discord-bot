import { KickApiClient } from "./auth.js";

// --- KICK SUBSCRIPTION MANAGEMENT ---
let kickClient: KickApiClient | null = null;
const getKickClient = async (): Promise<KickApiClient> => {
  if (!kickClient) {
    kickClient = await KickApiClient.getInstance();
  }
  return kickClient;
};

export const createKickSubscription = async (broadcasterId: number): Promise<any> => {
  const client = await getKickClient();
  const callbackUrl = process.env.NODE_ENV === 'development' ? `http://localhost:${process.env.PORT || 3000}/events/kick` : `https://${process.env.HOSTNAME}/events/kick`;
  const sub = await client.createEventSubSubscription(broadcasterId, callbackUrl);
  return sub?.data;
};

export const listKickSubscriptions = async (): Promise<any[]> => {
  const client = await getKickClient();
  const subs = await client.listEventSubSubscriptions();
  return subs?.data || [];
};

export const deleteAllKickSubscriptions = async (): Promise<number> => {
  const client = await getKickClient();
  const subs = await client.listEventSubSubscriptions();
  const existingSubscriptions = subs?.data || [];
  if (existingSubscriptions.length > 0) {
    await Promise.all(existingSubscriptions.map((sub: any) => client.deleteEventSubSubscription(sub.id)));
  }
  return existingSubscriptions.length;
};
