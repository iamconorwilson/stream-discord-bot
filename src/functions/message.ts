import { TwitchApiClient } from './auth/twitch/auth.js';
import { KickApiClient } from './auth/kick/auth.js';

type Platform = 'twitch' | 'kick';

interface NormalizedStreamData {
  streamTitle: string;
  streamCategory: string;
  username: string;
  streamUrl: string;
  streamThumbnail: string;
  userThumbnail: string;
}

const getTwitchStreamData = async (userId: string): Promise<NormalizedStreamData> => {
  const client = await TwitchApiClient.getInstance();
  const streamResult = await client.getStream(userId);
  const broadcasterResult = await client.getUserFromId(userId);

  if (!streamResult.data || (Array.isArray(streamResult.data) && streamResult.data.length === 0)) {
    throw new Error(`Stream for user ID ${userId} not found or user is not live.`);
  }
  if (!broadcasterResult.data || (Array.isArray(broadcasterResult.data) && broadcasterResult.data.length === 0)) {
    throw new Error(`Broadcaster for user ID ${userId} not found.`);
  }

  const stream = Array.isArray(streamResult.data) ? streamResult.data[0] : streamResult.data;
  const broadcaster = Array.isArray(broadcasterResult.data) ? broadcasterResult.data[0] : broadcasterResult.data;

  return {
    streamTitle: stream.title,
    streamCategory: stream.game_name,
    username: broadcaster.display_name,
    streamUrl: `https://twitch.tv/${broadcaster.login.toLowerCase()}`,
    streamThumbnail: stream.thumbnail_url.replace('{width}', '1280').replace('{height}', '720').concat(`?t=${Date.now()}`),
    userThumbnail: broadcaster.profile_image_url
  };
};

const getKickStreamData = async (userId: string): Promise<NormalizedStreamData> => {
  const client = await KickApiClient.getInstance();
  const channelResult = await client.getChannel(userId);
  const userResult = await client.getUser(userId);

  if (!channelResult) {
    throw new Error(`Channel for user ID ${userId} not found.`);
  }

  if (!userResult) {
    throw new Error(`User for user ID ${userId} not found.`);
  }

  const stream = channelResult.stream;
  if (!stream || stream.is_live === false) {
    throw new Error(`Stream for user ID ${userId} not live or missing.`);
  }

  const username = userResult.name;
  const profilePic = userResult.profile_picture;
  const streamTitle = channelResult.stream_title;
  const category = channelResult.category.name || 'Just Chatting';
  const slug = channelResult.slug;
  const streamThumbnail = channelResult.stream.thumbnail;

  return {
    streamTitle,
    streamCategory: category,
    username,
    streamUrl: `https://kick.com/${slug}`,
    streamThumbnail,
    userThumbnail: profilePic
  };
};

// Helper function to get stream and broadcaster info with retries
const getStreamWithRetry = async (platform: Platform, userId: string, retries = 6, delay = 5000): Promise<NormalizedStreamData | null> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (platform === 'twitch') {
        return await getTwitchStreamData(userId);
      } else if (platform === 'kick') {
        return await getKickStreamData(userId);
      }
    } catch (err: any) {
      const platformName = platform === 'twitch' ? 'Twitch' : 'Kick';
      console.error(`[${platformName}] ${err.message || err} Retrying... (${attempt}/${retries})`);
    }

    if (attempt < retries) {
      await new Promise(res => setTimeout(res, delay));
    }
  }
  return null;
};

// Send a message to Discord via webhook
export const sendMessage = async (platform: Platform, userId: string) => {

  const data = await getStreamWithRetry(platform, userId);

  if (!data) {
    console.error(`Failed to retrieve stream data for ${platform} user ID ${userId} after multiple attempts.`);
    return;
  }

  const message = {
    content: `${data.username} just went live at ${data.streamUrl} !`,
    type: 'rich',
    tts: false,
    embeds: [
      {
        description: '',
        fields: [
          {
            name: 'Game',
            value: `${data.streamCategory}`,
            inline: false
          }
        ],
        title: `${data.streamTitle}`,
        author: {
          name: `${data.username}`,
          icon_url: `${data.userThumbnail}`
        },
        url: `${data.streamUrl}`,
        image: {
          url: `${data.streamThumbnail}`
        },
        timestamp: new Date().toISOString(),
        color: platform === 'twitch' ? 9520895 : 5504024
      }
    ],
    username: platform === 'twitch' ? 'TwitchBot' : 'KickBot',
    avatar_url: `https://${process.env.HOSTNAME}/assets/${platform}.png`
  };

  try {
    const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!discordWebhookUrl) throw new Error("Discord webhook URL not found in environment.");

    const response = await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });
    if (!response.ok) {
      console.error('Error sending message to Discord:', response.statusText);
    }
  } catch (error) {
    console.error('Error sending message to Discord:', error);
  }
  console.log(`Sent Discord notification for ${data.username} (${platform})`);

};