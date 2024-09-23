# Twitch Discord Alerts
A simple JS application that sends a message to a Discord channel when a Twitch streamer goes live.

## Prerequisites
- Twitch application with a client ID and client secret (https://dev.twitch.tv/console)
- Discord webhook URL for the channel you want to send the alerts to (https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks)

## Installation
1. Clone the repository
2. Create a .env file in the root directory as follows:
```env
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret
EVENTSUB_SECRET=random_string # Used for verifying Twitch eventsub subscriptions
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxxxx/xxxxxxx # URL for the Discord webhook
HOSTNAME=xxxxxx # Hostname for the server
PORT=3000 # Port for the server
CHANNELS_PATH=channels.json # Path to the channels file relative to the root directory
```
3. Create a channels.json file at your chosen path, containing your tracked channel usernames:
```json
[
    "user1",
    "user2"
    //...
]
```
4. Install and build the application with `npm install && npm run build`
5. Start the application with `npm start`

## Local Development
The development environment uses ngrok to create a public URL for the application. To set up the development environment:
1. Create a .env.development file in the root directory. This file should contain the same variables as the .env file, but with an additional ngrok token variable:
```env
# ...
NGROK_AUTH_TOKEN=your_ngrok_auth_token
```
2. Run the development server with `npm run dev`
