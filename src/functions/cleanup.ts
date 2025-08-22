import type { ApiClient, HelixEventSubSubscription, HelixPaginatedEventSubSubscriptionsResult } from '@twurple/api';

const getAllSubscriptions = async (apiClient: ApiClient): Promise<HelixEventSubSubscription[]> => {
  let allSubscriptions: HelixEventSubSubscription[] = [];
  let currentCursor = '';
  let hasMore = true;

  while (hasMore) {
    try {
      const response: HelixPaginatedEventSubSubscriptionsResult = await apiClient.eventSub.getSubscriptions({ after: currentCursor });
      allSubscriptions = allSubscriptions.concat(response.data);

      if (response.cursor) {
        currentCursor = response.cursor;
      } else {
        hasMore = false; // No more cursor, so no more pages
      }
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
      hasMore = false; // Stop if an error occurs
    }
  }

  return allSubscriptions;
}


const deleteAllSubscriptions = async (apiClient: ApiClient): Promise<void> => {

  const subscriptions = await getAllSubscriptions(apiClient);
  console.log(`Found ${subscriptions.length} subscriptions.`);

  if (subscriptions.length === 0) {
    return;
  }

  const deletionPromises = subscriptions.map(async (subscription, index) => {
    try {
      await apiClient.eventSub.deleteSubscription(subscription.id);
      console.log(`Deleted subscription ${index + 1} of ${subscriptions.length} (ID: ${subscription.id})`);
    } catch (error) {
      console.error(`Failed to delete subscription with ID ${subscription.id}:`, error);
    }
  });
  await Promise.allSettled(deletionPromises);
}

export { deleteAllSubscriptions, getAllSubscriptions }