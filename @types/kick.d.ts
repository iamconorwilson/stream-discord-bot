interface KickUser {
  email: string;
  name: string;
  profile_picture: string;
  user_id: number;
}

interface KickChannel {
  broadcaster_user_id: number;
  category: {
    id: number;
    name: string;
  };
  channel_description: string;
  slug: string;
  stream_title: string;
  stream: KickStream;
}

interface KickStream {
  is_live: boolean;
  thumbnail: string;
}

interface KickLivestreamStatusUpdateEvent {
  broadcaster: {
    user_id: number;
    username: string;
    profile_picture: string;
    channel_slug: string;
  };
  is_live: boolean;
  title: string;
}