import axios from 'axios';

//  TYPES
import type { EventSubStreamOnlineEvent } from '@twurple/eventsub-base';
import type { HelixStream, HelixUser } from '@twurple/api';

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

const sendWebhook = async (event: EventSubStreamOnlineEvent) => {
  const username = event.broadcasterDisplayName;
  const stream: HelixStream | null = await event.getStream();
  const broadcaster: HelixUser = await event.getBroadcaster();

  if (!stream) {
    return console.error(`No stream found for ${username}`);
  }

  const streamTitle = stream.title;
  const streamCategory = stream.gameName;
  const streamUrl = `https://twitch.tv/${event.broadcasterName}`;
  const streamThumbnail = stream.thumbnailUrl
    .replace('{width}', '1280')
    .replace('{height}', '720');
  const userThumbnail = broadcaster.profilePictureUrl;

  const message = {
    content: `${username} just went live at [${streamUrl}](${streamUrl})!`,
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

  console.log(JSON.stringify(message));

  try {
    const response = await axios.post(webhookUrl, message);
    //log response code and message
    console.log(response.status, response.statusText);
  } catch (error) {
    console.error(error);
  }
};

export default sendWebhook;
