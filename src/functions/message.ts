import axios from 'axios';

//  TYPES
import type { EventSubStreamOnlineEvent } from '@twurple/eventsub-base';
import type { HelixStream, HelixUser } from '@twurple/api';

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getStreamWithRetry = async (
  event: EventSubStreamOnlineEvent,
  retries = 6,
  delayMs = 5000
): Promise<{ stream: HelixStream | null; broadcaster: HelixUser | null }> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const stream = await event.getStream();
      const broadcaster = await event.getBroadcaster();

      if (stream && broadcaster) {
        return { stream, broadcaster };
      }
      console.warn(
        `Attempt ${attempt} of ${retries} failed to get stream for ${event.broadcasterDisplayName}. Retrying in ${delayMs / 1000} seconds...`
      );
    } catch (err) {
      console.error(`Error on attempt ${attempt}:`, err);
    }
    await delay(delayMs);
  }
  return { stream: null, broadcaster: null };
}


const sendWebhook = async (event: EventSubStreamOnlineEvent) => {
  const username = event.broadcasterDisplayName;
  const { stream, broadcaster } = await getStreamWithRetry(event);

  if (!stream || !broadcaster) {
    return console.error(`No stream found for ${username}`);
  }

  const streamTitle = stream.title;
  const streamCategory = stream.gameName;
  const streamUrl = `https://twitch.tv/${event.broadcasterName}`;
  const streamThumbnail = stream.thumbnailUrl
    .replace('{width}', '1280')
    .replace('{height}', '720')
    .concat(`?t=${Date.now()}`);
  const userThumbnail = broadcaster.profilePictureUrl;

  const message = {
    content: `${username} just went live at ${streamUrl} !`,
    type: 'rich',
    tts: false,
    embeds: [
      {
        description: '',
        fields: [
          {
            name: 'Game',
            value: `${streamCategory}`,
            inline: false
          }
        ],
        title: `${streamTitle}`,
        author: {
          name: `${username}`,
          icon_url: `${userThumbnail}`
        },
        url: `${streamUrl}`,
        image: {
          url: `${streamThumbnail}`
        },
        timestamp: new Date().toISOString(),
        color: 9520895
      }
    ],
    username: 'TwitchBot'
  };

  // console.log(JSON.stringify(message));

  try {
    const response = await axios.post(webhookUrl, message);
    if (response.status !== 204) {
      console.log(response.status, response.statusText);
    } else {
      console.log(`Webhook sent successfully for ${username}`);
    }

  } catch (error) {
    console.error(error);
  }
};

export default sendWebhook;
