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
  if (!client.isAuthenticated) {
    console.warn("[Kick] Cannot create subscription: Not authenticated.");
    return null;
  }
  const sub = await client.createEventSubSubscription(broadcasterId);
  return sub?.data;
};

export const listKickSubscriptions = async (): Promise<any[]> => {
  const client = await getKickClient();
  if (!client.isAuthenticated) {
    console.warn("[Kick] Cannot list subscriptions: Not authenticated.");
    return [];
  }
  const subs = await client.listEventSubSubscriptions();
  return subs?.data || [];
};

export const deleteAllKickSubscriptions = async (): Promise<number> => {
  const client = await getKickClient();
  if (!client.isAuthenticated) {
    console.warn("[Kick] Cannot delete subscriptions: Not authenticated.");
    return 0;
  }
  const subs = await client.listEventSubSubscriptions();
  const existingSubscriptions = subs?.data || [];
  if (existingSubscriptions.length > 0) {
    await Promise.all(existingSubscriptions.map((sub: any) => client.deleteEventSubSubscription(sub.id)));
  }
  return existingSubscriptions.length;
};
