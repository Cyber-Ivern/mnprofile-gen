import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { config } from 'dotenv';
import express from 'express';
import cors from 'cors';
import SpotifyWebApi from 'spotify-web-api-node';
import OpenAI from 'openai';

// Load environment variables
config();

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
});

// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Express server for OAuth callback
const app = express();
app.use(cors());
app.use(express.json());

// Store user tokens temporarily (in production, use a proper database)
const userTokens = new Map<string, string>();

// Define commands
const commands = [
  new SlashCommandBuilder()
    .setName('connect')
    .setDescription('Connect your Spotify account'),
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Generate your music nerd profile'),
  new SlashCommandBuilder()
    .setName('tracks')
    .setDescription('Show your top tracks'),
].map(command => command.toJSON());

// Register commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
      { body: commands },
    );
    console.log('Successfully registered application commands.');
  } catch (error) {
    console.error(error);
  }
})();

// Handle commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  switch (commandName) {
    case 'connect':
      await handleConnect(interaction);
      break;
    case 'profile':
      await handleProfile(interaction);
      break;
    case 'tracks':
      await handleTracks(interaction);
      break;
  }
});

// Command handlers
async function handleConnect(interaction: any) {
  const scopes = ['user-top-read'];
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, interaction.user.id);
  
  await interaction.reply({
    content: `Click this link to connect your Spotify account: ${authorizeURL}`,
    ephemeral: true,
  });
}

async function handleProfile(interaction: any) {
  const userId = interaction.user.id;
  const accessToken = userTokens.get(userId);

  if (!accessToken) {
    await interaction.reply({
      content: 'Please connect your Spotify account first using /connect',
      ephemeral: true,
    });
    return;
  }

  spotifyApi.setAccessToken(accessToken);

  try {
    const topTracks = await spotifyApi.getMyTopTracks({ limit: 10 });
    const trackNames = topTracks.body.items.map(track => track.name).join(', ');

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a music critic who creates witty, insightful profiles based on someone\'s top tracks.',
        },
        {
          role: 'user',
          content: `Create a music nerd profile based on these top tracks: ${trackNames}`,
        },
      ],
      model: 'gpt-4',
    });

    const profile = completion.choices[0].message.content;

    const embed = new EmbedBuilder()
      .setTitle(`${interaction.user.username}'s Music Nerd Profile`)
      .setDescription(profile)
      .setColor('#1DB954')
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: 'An error occurred while generating your profile.',
      ephemeral: true,
    });
  }
}

async function handleTracks(interaction: any) {
  const userId = interaction.user.id;
  const accessToken = userTokens.get(userId);

  if (!accessToken) {
    await interaction.reply({
      content: 'Please connect your Spotify account first using /connect',
      ephemeral: true,
    });
    return;
  }

  spotifyApi.setAccessToken(accessToken);

  try {
    const topTracks = await spotifyApi.getMyTopTracks({ limit: 10 });
    
    const embed = new EmbedBuilder()
      .setTitle(`${interaction.user.username}'s Top Tracks`)
      .setDescription(
        topTracks.body.items
          .map((track, index) => `${index + 1}. ${track.name} - ${track.artists[0].name}`)
          .join('\n')
      )
      .setColor('#1DB954')
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: 'An error occurred while fetching your top tracks.',
      ephemeral: true,
    });
  }
}

// OAuth callback endpoint
app.get('/api/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  
  try {
    const data = await spotifyApi.authorizationCodeGrant(code as string);
    const { access_token } = data.body;
    
    // Store the token (in production, use a proper database)
    userTokens.set(state as string, access_token);
    
    res.send('Successfully connected! You can close this window and return to Discord.');
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred during authentication.');
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN); 