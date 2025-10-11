import { TwitchApiClient } from './auth.js';

const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

const getStreamWithRetry = async (userId: string, retries = 6, delay = 5000): Promise<{ stream: TwitchStream | null; broadcaster: TwitchUser | null }> => {
  const client = await TwitchApiClient.create();
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const streamResult = await client.getStream(userId);
      const broadcasterResult = await client.getUserFromId(userId);

      if (!streamResult.data || (Array.isArray(streamResult.data) && streamResult.data.length === 0)) {
        console.error(`Stream for user ID ${userId} not found or user is not live. Retrying... (${attempt}/${retries})`);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }
      if (!broadcasterResult.data || (Array.isArray(broadcasterResult.data) && broadcasterResult.data.length === 0)) {
        console.error(`Broadcaster for user ID ${userId} not found. Retrying... (${attempt}/${retries})`);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }

      const stream = Array.isArray(streamResult.data) ? streamResult.data[0] : streamResult.data;
      const broadcaster = Array.isArray(broadcasterResult.data) ? broadcasterResult.data[0] : broadcasterResult.data;

      return { stream, broadcaster };
    } catch (err) {
      console.error(`Error on attempt ${attempt}:`, err);
    }
    
  }
  return { stream: null, broadcaster: null };
}

const sendMessage = async (userId: string) => {

  const { stream, broadcaster } = await getStreamWithRetry(userId);

  if (!stream || !broadcaster) {
    console.error(`Failed to retrieve stream data for user ID ${userId} after multiple attempts.`);
    return;
  }

  const streamTitle = stream.title;
  const streamCategory = stream.game_name;
  const username = broadcaster.display_name;
  const streamUrl = `https://twitch.tv/${username}`;
  const streamThumbnail = stream.thumbnail_url
    .replace('{width}', '1280')
    .replace('{height}', '720')
    .concat(`?t=${Date.now()}`);
  const userThumbnail = broadcaster.profile_image_url;

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

  try {
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

}

export { sendMessage };