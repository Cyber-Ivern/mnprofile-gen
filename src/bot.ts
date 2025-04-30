import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, InteractionResponseType } from 'discord.js';
import { config } from 'dotenv';
import express, { Request, Response } from 'express';
import cors from 'cors';
import SpotifyWebApi from 'spotify-web-api-node';
import OpenAI from 'openai';
import { verifyKey } from 'discord-interactions';

// Load environment variables
config(); 

// Check for essential environment variables
const requiredEnvVars = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

// Check if any required environment variables are missing
const missingEnvVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingEnvVars.length > 0) {
  console.error(`Error: Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1); // Exit if a required variable is missing
}

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
  clientId: requiredEnvVars.SPOTIFY_CLIENT_ID!,
  clientSecret: requiredEnvVars.SPOTIFY_CLIENT_SECRET!,
  redirectUri: requiredEnvVars.SPOTIFY_REDIRECT_URI!,
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: requiredEnvVars.OPENAI_API_KEY!,
});

// Initialize Express server for OAuth callback
const app = express();
app.use(cors());
app.use(express.json());

// Discord interaction verification
app.post('/', (req: Request, res: Response) => {
  console.log('Received verification request');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const body = JSON.stringify(req.body);

  if (!signature || !timestamp) {
    console.log('Missing signature or timestamp');
    return res.status(401).send('Missing signature or timestamp');
  }

  try {
    console.log('Verifying with public key:', process.env.DISCORD_PUBLIC_KEY);
    const isValid = verifyKey(body, signature as string, timestamp as string, process.env.DISCORD_PUBLIC_KEY!);
    console.log('Verification result:', isValid);

    if (!isValid) {
      return res.status(401).send('Invalid signature');
    }

    // Handle the verification request
    if (req.body.type === 1) {
      console.log('Sending verification response');
      return res.json({ type: 1 });
    }

    return res.status(200).send('OK');
  } catch (error) {
    console.error('Verification error:', error);
    return res.status(401).send('Verification failed');
  }
});

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
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Check if your Spotify account is connected'),
  new SlashCommandBuilder()
    .setName('image')
    .setDescription('Generate an image based on your music taste'),
].map(command => command.toJSON());

// Register commands
const rest = new REST({ version: '10' }).setToken(requiredEnvVars.DISCORD_TOKEN!);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(requiredEnvVars.DISCORD_CLIENT_ID!),
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

  try {
    // Defer the reply immediately to prevent timeout
    await interaction.deferReply();

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
      case 'verify':
        await handleVerify(interaction);
        break;
      case 'image':
        await handleImage(interaction);
        break;
      default:
        await interaction.editReply('Unknown command');
    }
  } catch (error) {
    console.error('Command error:', error);
    try {
      // Try to edit the deferred reply
      if (interaction.deferred) {
        await interaction.editReply('An error occurred while processing your command.');
      } else {
        // If we couldn't defer, try to reply
        await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
      }
    } catch (e) {
      console.error('Error handling command error:', e);
    }
  }
});

// Command handlers
async function handleConnect(interaction: any) {
  const scopes = [
    'user-top-read',
    'user-read-private',
    'user-read-email'
  ];
  
  const state = interaction.user.id;
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);
  
  try {
    await interaction.user.send(`Click this link to connect your Spotify account: ${authorizeURL}`);
    await interaction.editReply({
      content: 'I\'ve sent you a DM with the Spotify connection link!',
      ephemeral: true,
    });
  } catch (error) {
    await interaction.editReply({
      content: 'I couldn\'t send you a DM. Please make sure you have DMs enabled for this server.',
      ephemeral: true,
    });
  }
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

  // Show typing indicator
  await interaction.deferReply();

  spotifyApi.setAccessToken(accessToken);

  try {
    // Fetch top tracks
    const topTracks = await spotifyApi.getMyTopTracks({ limit: 10 });
    
    // Format tracks for display
    const trackList = topTracks.body.items
      .map((track, index) => {
        const artists = track.artists.map(artist => artist.name).join(', ');
        return `${index + 1}. **${track.name}** - ${artists}`;
      })
      .join('\n');

    // Generate profile with enhanced prompt
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a witty and insightful music critic who creates engaging profiles based on someone's top tracks. 
          Focus on identifying patterns, genres, and musical preferences. 
          Be specific about the artists and songs mentioned.
          Keep the profile concise (2-3 paragraphs) and engaging.`,
        },
        {
          role: 'user',
          content: `Create a music nerd profile based on these top tracks: ${trackList}`,
        },
      ],
      model: 'gpt-4',
      temperature: 0.7,
    });

    const profile = completion.choices[0].message.content;

    // Create rich embed
    const embed = new EmbedBuilder()
      .setTitle(`🎵 ${interaction.user.username}'s Music Nerd Profile`)
      .setDescription(profile)
      .addFields(
        { name: '🎧 Top Tracks', value: trackList }
      )
      .setColor('#1DB954')
      .setFooter({ text: 'Generated with Spotify & OpenAI' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error: unknown) {
    console.error('Profile generation error:', error);
    
    let errorMessage = 'An error occurred while generating your profile.';
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const spotifyError = error as { statusCode: number };
      if (spotifyError.statusCode === 401) {
        errorMessage = 'Your Spotify session has expired. Please reconnect using /connect';
      } else if (spotifyError.statusCode === 429) {
        errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
      }
    }

    await interaction.editReply({
      content: errorMessage,
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

async function handleVerify(interaction: any) {
  const userId = interaction.user.id;
  const isConnected = userTokens.has(userId);

  if (isConnected) {
    await interaction.reply({
      content: '✅ Your Spotify account is connected!',
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: '❌ Your Spotify account is not connected. Use /connect to link it.',
      ephemeral: true,
    });
  }
}

async function handleImage(interaction: any) {
  const userId = interaction.user.id;
  const accessToken = userTokens.get(userId);

  if (!accessToken) {
    await interaction.reply({
      content: 'Please connect your Spotify account first using /connect',
      ephemeral: true,
    });
    return;
  }

  // Show typing indicator
  await interaction.deferReply();

  spotifyApi.setAccessToken(accessToken);

  try {
    // Fetch top tracks
    const topTracks = await spotifyApi.getMyTopTracks({ limit: 5 });
    const trackList = topTracks.body.items
      .map(track => `${track.name} by ${track.artists[0].name}`)
      .join(', ');

    // Generate image prompt
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a creative prompt engineer who creates vivid, artistic prompts for image generation based on music taste.',
        },
        {
          role: 'user',
          content: `Create a detailed, artistic prompt for an image that represents this music taste: ${trackList}. 
          The image should be abstract and artistic, not literal. Focus on colors, moods, and emotions. 
          Keep the prompt under 100 words.`,
        },
      ],
      model: 'gpt-4',
      temperature: 0.7,
    });

    const imagePrompt = completion.choices[0].message.content;

    // Generate image using DALL-E
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt || '',
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
    });

    const imageUrl = imageResponse.data[0].url;

    // Create rich embed
    const embed = new EmbedBuilder()
      .setTitle(`🎨 ${interaction.user.username}'s Music Visualization`)
      .setDescription(`*"${imagePrompt}"*`)
      .setImage(imageUrl || '')
      .setColor('#1DB954')
      .setFooter({ text: 'Generated with Spotify & OpenAI DALL-E' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error: unknown) {
    console.error('Image generation error:', error);
    
    let errorMessage = 'An error occurred while generating your image.';
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const spotifyError = error as { statusCode: number };
      if (spotifyError.statusCode === 401) {
        errorMessage = 'Your Spotify session has expired. Please reconnect using /connect';
      } else if (spotifyError.statusCode === 429) {
        errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
      }
    }

    await interaction.editReply({
      content: errorMessage,
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

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN); 