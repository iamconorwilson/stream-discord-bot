# Twitch Discord Alerts
A simple Typescript application that sends a message to a Discord channel when a Twitch streamer goes live.

## Prerequisites
- Twitch application with a client ID and client secret (https://dev.twitch.tv/console)
- Discord webhook URL for the channel you want to send the alerts to (https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks)

## Installation
1. Clone the repository
2. Create a .env file in the root directory as follows:
```env
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxxxx/xxxxxxx # URL for the Discord webhook
HOSTNAME=xxxxxx # Hostname for the server
PORT=3000 # Port for the server
DATA_PATH=./data # Path to the data directory, containing a channels.json file
```
3. Create a channels.json file at your chosen data path, containing your tracked channel usernames:
```json
[
    "user1",
    "user2"
]
```
4. Install and build the application with `npm install && npm run build`
5. Start the application with `npm start`

## Local Development
The development environment uses the Twitch CLI to trigger test notifications. To set up the development environment:
1. Install the Twitch CLI (https://dev.twitch.tv/docs/cli/)
2. Create a .env.dev file in the root directory. This file should contain the same variables as the .env file, but with an additional `EVENTSUB_SECRET` variable and `HOSTNAME` changed to `localhost`:
```env
# ...
EVENTSUB_SECRET=dev_secret
HOSTNAME=localhost
```
3. Run the development server with `npm run dev`
4. Use the Twitch CLI to send a mock request `twitch event trigger streamup -F http://localhost:3000/events/twitch -s <your_dev_secret> -t <broadcaster_id>`
