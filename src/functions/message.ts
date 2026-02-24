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

// Helper function to get stream and broadcaster info with retries
const getStreamWithRetry = async (platform: Platform, userId: string, retries = 6, delay = 5000): Promise<NormalizedStreamData | null> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (platform === 'twitch') {
        const client = await TwitchApiClient.getInstance();
        const streamResult = await client.getStream(userId);
        const broadcasterResult = await client.getUserFromId(userId);

        if (!streamResult.data || (Array.isArray(streamResult.data) && streamResult.data.length === 0)) {
          console.error(`[Twitch] Stream for user ID ${userId} not found or user is not live. Retrying... (${attempt}/${retries})`);
          await new Promise(res => setTimeout(res, delay));
          continue;
        }
        if (!broadcasterResult.data || (Array.isArray(broadcasterResult.data) && broadcasterResult.data.length === 0)) {
          console.error(`[Twitch] Broadcaster for user ID ${userId} not found. Retrying... (${attempt}/${retries})`);
          await new Promise(res => setTimeout(res, delay));
          continue;
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
      } else if (platform === 'kick') {
        const client = await KickApiClient.getInstance();
        const channelResult = await client.getChannel(userId);
        const userResult = await client.getUser(userId);

        if (!channelResult || channelResult.error) {
          console.error(`[Kick] Channel for user ID ${userId} not found. Retrying... (${attempt}/${retries})`);
          await new Promise(res => setTimeout(res, delay));
          continue;
        }

        const stream = channelResult.livestream || channelResult.stream || channelResult;
        if (!stream || stream.is_live === false) {
          console.error(`[Kick] Stream for user ID ${userId} not live or missing. Retrying... (${attempt}/${retries})`);
          await new Promise(res => setTimeout(res, delay));
          continue;
        }

        const username = userResult?.[0]?.name || userResult?.[0]?.username || userResult?.name || userResult?.username || channelResult.user?.username || 'Unknown Streamer';
        const profilePic = userResult?.[0]?.profile_pic || userResult?.profile_pic || channelResult.user?.profile_pic || '';
        const streamTitle = stream.session_title || stream.title || username;
        const category = stream.categories?.[0]?.name || stream.category?.name || 'Just Chatting';
        const slug = userResult?.[0]?.slug || userResult?.slug || channelResult.slug || username;

        // Ensure stream.thumbnail is safely read whether it's an object {url} or a string
        const thumbnailObj = stream.thumbnail;
        const streamThumbnail = (typeof thumbnailObj === 'object' && thumbnailObj !== null) ? (thumbnailObj.url || '') : (thumbnailObj || stream.thumbnail_url || '');

        return {
          streamTitle,
          streamCategory: category,
          username,
          streamUrl: `https://kick.com/${slug}`,
          streamThumbnail,
          userThumbnail: profilePic
        };
      }
    } catch (err) {
      console.error(`Error on attempt ${attempt}:`, err);
    }
  }
  return null;
}

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
        color: platform === 'twitch' ? 9520895 : 5439284
      }
    ],
    username: platform === 'twitch' ? 'TwitchBot' : 'KickBot'
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