import { KickApiClient } from "./auth.js";

let client: KickApiClient | null = null;

// --- KICK SUBSCRIPTION MANAGEMENT ---
const getClient = async (): Promise<KickApiClient> => {
  if (!client) {
    client = await KickApiClient.getInstance();
  }
  return client;
};

export const createKickOnlineSubscription = async (broadcasterId: number): Promise<any> => {
  const client = await getClient();
  if (!client.isAuthenticated) {
    console.warn("[Kick] Cannot create subscription: Not authenticated.");
    return null;
  }
  const events = [{ name: "livestream.status.updated", version: 1 }];
  const sub = await client.createEventSubSubscription(broadcasterId, events);
  return sub?.data;
};

export const listKickSubscriptions = async (): Promise<any[]> => {
  const client = await getClient();
  if (!client.isAuthenticated) {
    console.warn("[Kick] Cannot list subscriptions: Not authenticated.");
    return [];
  }
  const { data: subs } = await client.listEventSubSubscriptions();
  return subs || [];
};

export const deleteKickSubscription = async (subscriptionId: string): Promise<void> => {
  const client = await getClient();
  if (!client.isAuthenticated) {
    console.warn("[Kick] Cannot delete subscription: Not authenticated.");
    return;
  }
  await client.deleteEventSubSubscription(subscriptionId);
};

export const deleteAllKickSubscriptions = async (): Promise<number> => {
  const client = await getClient();
  if (!client.isAuthenticated) {
    console.warn("[Kick] Cannot delete subscriptions: Not authenticated.");
    return 0;
  }
  const { data: subs } = await client.listEventSubSubscriptions();
  if (subs && subs.length > 0) {
    await Promise.all(subs.map((sub: any) => client.deleteEventSubSubscription(sub.id)));
  }
  return subs ? subs.length : 0;
};
