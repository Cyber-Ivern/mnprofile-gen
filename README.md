# Music Nerd Profile Generator Discord Bot

A Discord bot that generates music nerd profiles based on users' Spotify listening history. This bot is a Discord version of the mnprofile-gen web application.

## Features

- Connect your Spotify account via OAuth
- View your top tracks
- Generate a music nerd profile based on your listening history
- Deployable to Vercel

## Prerequisites

- Node.js 18 or higher
- A Discord bot token
- A Spotify Developer account
- An OpenAI API key

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   DISCORD_TOKEN=your_discord_bot_token
   DISCORD_CLIENT_ID=your_discord_client_id
   DISCORD_CLIENT_SECRET=your_discord_client_secret
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   SPOTIFY_REDIRECT_URI=http://localhost:3000/api/auth/callback
   OPENAI_API_KEY=your_openai_api_key
   PORT=3000
   NODE_ENV=development
   ```

## Development

Run the bot in development mode:
```bash
npm run dev
```

## Deployment to Vercel

1. Create a new project on Vercel
2. Connect your GitHub repository
3. Configure the following environment variables in Vercel:
   - All variables from your `.env` file
   - Update `SPOTIFY_REDIRECT_URI` to your Vercel deployment URL
4. Deploy!

## Commands

- `/connect` - Connect your Spotify account
- `/profile` - Generate your music nerd profile
- `/tracks` - View your top tracks

## License

MIT

