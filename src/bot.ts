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
app.post('/', async (req: Request, res: Response) => {
  let responseSent = false;
  
  const sendResponse = (data: any) => {
    if (!responseSent) {
      responseSent = true;
      return res.json(data);
    }
  };

  const sendError = (status: number, message: string) => {
    if (!responseSent) {
      responseSent = true;
      return res.status(status).send(message);
    }
  };

  console.log('Received request');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const body = JSON.stringify(req.body);

  if (!signature || !timestamp) {
    console.log('Missing signature or timestamp');
    return sendError(401, 'Missing signature or timestamp');
  }

  try {
    console.log('Verifying request');
    const isValid = verifyKey(body, signature as string, timestamp as string, process.env.DISCORD_PUBLIC_KEY!);
    console.log('Verification result:', isValid);

    if (!isValid) {
      return sendError(401, 'Invalid signature');
    }

    // Handle the verification request
    if (req.body.type === 1) {
      console.log('Sending verification response');
      return sendResponse({ type: 1 });
    }

    // Handle the actual interaction
    console.log('Handling interaction:', req.body.type);
    const interaction = req.body;

    if (interaction.type === 2) { // Application Command
      const commandName = interaction.data.name;
      console.log('Command received:', commandName);

      try {
        let response;
        switch (commandName) {
          case 'connect':
            response = await handleConnect(interaction);
            break;
          case 'profile':
            response = await handleProfile(interaction);
            // Start processing in the background
            processProfile(interaction).then(updateResponse => {
              // Send the update response to Discord
              fetch(`https://discord.com/api/v10/webhooks/${process.env.DISCORD_CLIENT_ID}/${interaction.token}/messages/@original`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(updateResponse.data),
              }).catch(console.error);
            }).catch(console.error);
            break;
          case 'tracks':
            response = await handleTracks(interaction);
            break;
          case 'verify':
            response = await handleVerify(interaction);
            break;
          case 'image':
            response = await handleImage(interaction);
            // Start processing in the background
            processImage(interaction).then(updateResponse => {
              // Send the update response to Discord
              fetch(`https://discord.com/api/v10/webhooks/${process.env.DISCORD_CLIENT_ID}/${interaction.token}/messages/@original`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(updateResponse.data),
              }).catch(console.error);
            }).catch(console.error);
            break;
          default:
            console.log('Unknown command:', commandName);
            response = {
              type: 4,
              data: {
                content: 'Unknown command',
                flags: 64
              }
            };
        }
        return sendResponse(response);
      } catch (error) {
        console.error('Error handling command:', error);
        return sendResponse({
          type: 4,
          data: {
            content: 'An error occurred while processing your command.',
            flags: 64
          }
        });
      }
    }

    // If we get here, it's an unhandled interaction type
    return sendResponse({
      type: 4,
      data: {
        content: 'Unhandled interaction type',
        flags: 64
      }
    });
  } catch (error) {
    console.error('Verification error:', error);
    return sendError(401, 'Verification failed');
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
  console.log('Connect command received');
  console.log('Interaction data:', interaction);

  // Use the same redirect URI as the web app
  const webAppRedirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI || process.env.SPOTIFY_REDIRECT_URI;
  const scopes = [
    'user-top-read',
    'user-read-private',
    'user-read-email'
  ];
  
  try {
    console.log('Creating authorization URL');
    const userId = interaction.member?.user?.id || interaction.user?.id;
    console.log('User ID:', userId);
    
    if (!userId) {
      throw new Error('Could not find user ID in interaction');
    }

    // Build the Spotify authorization URL using the web app's flow
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.SPOTIFY_CLIENT_ID!,
      scope: scopes.join(' '),
      redirect_uri: webAppRedirectUri!,
      state: userId,
      show_dialog: 'true'
    });
    const authorizeURL = `https://accounts.spotify.com/authorize?${params.toString()}`;
    console.log('Authorization URL created:', authorizeURL);

    // Create DM channel with the user
    const dmResponse = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient_id: userId
      })
    });

    if (!dmResponse.ok) {
      throw new Error('Failed to create DM channel');
    }

    const dmChannel = await dmResponse.json();

    // Send the authorization URL via DM
    await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: `Click this link to connect your Spotify account: ${authorizeURL}`
      })
    });

    // Return a response to the original interaction
    return {
      type: 4,
      data: {
        content: 'I\'ve sent you a DM with the Spotify authorization link!',
        flags: 64 // EPHEMERAL
      }
    };
  } catch (error) {
    console.error('Error in handleConnect:', error);
    return {
      type: 4,
      data: {
        content: 'An error occurred while processing your request. Please make sure you have DMs enabled.',
        flags: 64
      }
    };
  }
}

async function handleProfile(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const accessToken = userTokens.get(userId);

  if (!accessToken) {
    return {
      type: 4,
      data: {
        content: 'Please connect your Spotify account first using /connect',
        flags: 64
      }
    };
  }

  // Send a deferred response immediately
  return {
    type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      flags: 64 // EPHEMERAL
    }
  };
}

async function handleTracks(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const accessToken = userTokens.get(userId);

  if (!accessToken) {
    return {
      type: 4,
      data: {
        content: 'Please connect your Spotify account first using /connect',
        flags: 64
      }
    };
  }

  try {
    spotifyApi.setAccessToken(accessToken);
    const topTracks = await spotifyApi.getMyTopTracks({ limit: 10 });

    if (!topTracks.body.items.length) {
      return {
        type: 4,
        data: {
          content: 'No top tracks found for your Spotify account.',
          flags: 64
        }
      };
    }

    const embed = {
      title: `${interaction.member?.user?.username || interaction.user?.username}'s Top Tracks`,
      description: topTracks.body.items
        .map((track, index) => `${index + 1}. ${track.name} - ${track.artists[0].name}`)
        .join('\n'),
      color: 0x1DB954,
      timestamp: new Date().toISOString()
    };

    return {
      type: 4,
      data: {
        embeds: [embed]
      }
    };
  } catch (error: any) {
    console.error('Tracks error:', error);

    let errorMessage = 'An error occurred while fetching your top tracks.';
    if (error.statusCode === 401 || error.statusCode === 403) {
      errorMessage = 'Your Spotify session has expired or you did not grant the required permissions. Please reconnect using /connect and approve all requested permissions.';
    } else if (error.statusCode === 429) {
      errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
    }

    return {
      type: 4,
      data: {
        content: errorMessage,
        flags: 64
      }
    };
  }
}

async function handleVerify(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const isConnected = userTokens.has(userId);

  return {
    type: 4,
    data: {
      content: isConnected ? '✅ Your Spotify account is connected!' : '❌ Your Spotify account is not connected. Use /connect to link it.',
      flags: 64
    }
  };
}

async function handleImage(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const accessToken = userTokens.get(userId);

  if (!accessToken) {
    return {
      type: 4,
      data: {
        content: 'Please connect your Spotify account first using /connect',
        flags: 64
      }
    };
  }

  // Send a deferred response immediately
  return {
    type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      flags: 64 // EPHEMERAL
    }
  };
}

// Add new functions to handle the actual processing
async function processProfile(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const accessToken = userTokens.get(userId);

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
    const embed = {
      title: `🎵 ${interaction.member?.user?.username || interaction.user?.username}'s Music Nerd Profile`,
      description: profile,
      fields: [
        {
          name: '🎧 Top Tracks',
          value: trackList
        }
      ],
      color: 0x1DB954,
      footer: {
        text: 'Generated with Spotify & OpenAI'
      },
      timestamp: new Date().toISOString()
    };

    return {
      type: 7, // UPDATE_MESSAGE
      data: {
        embeds: [embed]
      }
    };
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

    return {
      type: 7, // UPDATE_MESSAGE
      data: {
        content: errorMessage,
        flags: 64
      }
    };
  }
}

async function processImage(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const accessToken = userTokens.get(userId);

  spotifyApi.setAccessToken(accessToken);

  try {
    // Fetch top tracks
    const topTracks = await spotifyApi.getMyTopTracks({ limit: 5 });
    const tracks = topTracks.body.items.map(track => ({
      name: track.name,
      artist: track.artists[0].name
    }));

    // Call the web app's image generation endpoint
    const response = await fetch('https://YOUR_WEB_APP_DOMAIN/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks })
    });
    const data = await response.json();
    if (!response.ok || !data.imageUrl) {
      throw new Error(data.error || 'Failed to generate image');
    }
    const imageUrl = data.imageUrl;

    // Create rich embed
    const embed = {
      title: `🎨 ${interaction.member?.user?.username || interaction.user?.username}'s Music Visualization`,
      description: `*Generated by your music taste*`,
      image: {
        url: imageUrl || ''
      },
      color: 0x1DB954,
      footer: {
        text: 'Generated with Spotify & OpenAI DALL-E'
      },
      timestamp: new Date().toISOString()
    };

    return {
      type: 7, // UPDATE_MESSAGE
      data: {
        embeds: [embed]
      }
    };
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

    return {
      type: 7, // UPDATE_MESSAGE
      data: {
        content: errorMessage,
        flags: 64
      }
    };
  }
}

// Add token refresh function
async function refreshSpotifyToken(userId: string): Promise<boolean> {
  try {
    const refreshToken = userTokens.get(`${userId}_refresh`);
    if (!refreshToken) {
      return false;
    }

    spotifyApi.setRefreshToken(refreshToken);
    const data = await spotifyApi.refreshAccessToken();
    const newAccessToken = data.body.access_token;
    
    // Store the new access token
    userTokens.set(userId, newAccessToken);
    return true;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return false;
  }
}

// Update the OAuth callback to store refresh token
app.get('/api/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  
  try {
    const data = await spotifyApi.authorizationCodeGrant(code as string);
    const { access_token, refresh_token } = data.body;
    
    // Store both tokens
    userTokens.set(state as string, access_token);
    userTokens.set(`${state}_refresh`, refresh_token);
    
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