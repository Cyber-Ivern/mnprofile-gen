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
  clientId: process.env.SPOTIFY_CLIENT_ID!,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
  redirectUri: process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}/api/callback`
    : 'http://127.0.0.1:3000/api/callback'
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Initialize Express server for OAuth callback
const app = express();
app.use(cors());
app.use(express.json());

// Add this near the top with other global variables
const userTracksCache = new Map<string, { tracks: any[], timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

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
            break;
          case 'tracks':
            response = await handleTracks(interaction);
            break;
          case 'verify':
            response = await handleVerify(interaction);
            break;
          case 'image':
            response = await handleImage(interaction);
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

// Handle commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  try {
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
        await interaction.reply({ content: 'Unknown command', ephemeral: true });
    }
  } catch (error) {
    console.error('Command error:', error);
    try {
      await interaction.reply({ 
        content: 'An error occurred while processing your command.', 
        ephemeral: true 
      });
    } catch (e) {
      console.error('Error handling command error:', e);
    }
  }
});

// Command handlers
async function handleConnect(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const scopes = [
    'user-top-read',
    'user-read-private',
    'user-read-email'
  ];

  // Use the same redirect URI logic as the callback handler
  const redirectUri = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/api/auth/callback`
    : 'http://127.0.0.1:3000/api/auth/callback';

  try {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.SPOTIFY_CLIENT_ID!,
      scope: scopes.join(' '),
      redirect_uri: redirectUri,
      state: userId,
      show_dialog: 'true'
    });
    const authorizeURL = `https://accounts.spotify.com/authorize?${params.toString()}`;

    // Create DM channel with the user
    const dmChannel = await interaction.user.createDM();
    await dmChannel.send(`Click this link to connect your Spotify account: ${authorizeURL}`);

    await interaction.reply({
      content: 'I\'ve sent you a DM with the Spotify authorization link! Make sure you have DMs enabled.',
      ephemeral: true
    });
  } catch (error) {
    console.error('Error in handleConnect:', error);
    await interaction.reply({
      content: 'An error occurred while processing your request. Please make sure you have DMs enabled.',
      ephemeral: true
    });
  }
}

async function handleProfile(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const accessToken = userTokens.get(userId);

  if (!accessToken) {
    await interaction.reply({
      content: 'Please connect your Spotify account first using /connect',
      ephemeral: true
    });
    return;
  }

  try {
    // Show typing indicator
    await interaction.deferReply();

    // Check cache first
    const cachedData = userTracksCache.get(userId);
    let tracks;
    
    if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_DURATION) {
      console.log('Profile - Using cached tracks data');
      tracks = cachedData.tracks.map(track => ({
        name: track.name,
        artist: track.artists[0].name
      }));
    } else {
      console.log('Profile - Cache miss, fetching from Spotify...');
      spotifyApi.setAccessToken(accessToken);
      const topTracks = await retryOperation(
        () => spotifyApi.getMyTopTracks({ limit: 10 }),
        3,
        1000
      );
      
      tracks = topTracks.body.items.map(track => ({
        name: track.name,
        artist: track.artists[0].name
      }));
      
      // Update cache
      userTracksCache.set(userId, {
        tracks: topTracks.body.items,
        timestamp: Date.now()
      });
    }

    const displayName = interaction.member?.user?.username || interaction.user?.username;
    console.log('Profile - Prepared data:', { displayName, trackCount: tracks.length });

    // Format tracks for display
    const trackList = tracks
      .map((track, index) => `${index + 1}. **${track.name}** - ${track.artist}`)
      .join('\n');

    // Generate profile analysis using OpenAI
    console.log('Profile - Generating analysis with OpenAI...');
    const completion = await retryOperation(
      () => openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are a witty and insightful music critic who creates engaging profiles based on someone's top tracks. 
            Focus on identifying patterns, genres, and musical preferences. 
            Be specific about the artists and songs mentioned.
            Keep the profile concise (2-3 paragraphs) and engaging.
            Format the response with emojis and markdown for better readability.
            Include a fun title for the profile.`
          },
          {
            role: "user",
            content: `Create a music nerd profile based on these top tracks: ${trackList}`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      }),
      3,
      1000
    );

    const profile = completion.choices[0].message.content;
    console.log('Profile - OpenAI response received');

    // Create rich embed
    const embed = new EmbedBuilder()
      .setTitle(`🎵 ${displayName}'s Music Nerd Profile`)
      .setDescription(profile)
      .addFields({
        name: '🎧 Top Tracks',
        value: trackList
      })
      .setColor(0x1DB954)
      .setFooter({ text: 'Generated with Spotify & OpenAI' })
      .setTimestamp();

    // Handle both local and production environments
    if (interaction.deferred) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  } catch (error: any) {
    console.error('Profile generation error:', error);
    
    let errorMessage = 'An error occurred while generating your profile.';
    if (error.statusCode === 401) {
      errorMessage = 'Your Spotify session has expired. Please reconnect using /connect';
    } else if (error.statusCode === 429) {
      errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
    }

    // Handle both local and production environments
    if (interaction.deferred) {
      await interaction.editReply({
        content: errorMessage,
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: errorMessage,
        ephemeral: true
      });
    }
  }
}

async function handleTracks(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const accessToken = userTokens.get(userId);

  if (!accessToken) {
    await interaction.reply({
      content: 'Please connect your Spotify account first using /connect',
      ephemeral: true
    });
    return;
  }

  try {
    spotifyApi.setAccessToken(accessToken);
    const topTracks = await spotifyApi.getMyTopTracks({ limit: 10 });

    if (!topTracks.body.items.length) {
      await interaction.reply({
        content: 'No top tracks found for your Spotify account.',
        ephemeral: true
      });
      return;
    }

    // Store tracks in cache
    userTracksCache.set(userId, {
      tracks: topTracks.body.items,
      timestamp: Date.now()
    });

    const embed = new EmbedBuilder()
      .setTitle(`${interaction.member?.user?.username || interaction.user?.username}'s Top Tracks`)
      .setDescription(topTracks.body.items
        .map((track, index) => `${index + 1}. ${track.name} - ${track.artists[0].name}`)
        .join('\n'))
      .setColor(0x1DB954)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error: any) {
    console.error('Tracks error:', error);

    let errorMessage = 'An error occurred while fetching your top tracks.';
    if (error.statusCode === 401 || error.statusCode === 403) {
      errorMessage = 'Your Spotify session has expired or you did not grant the required permissions. Please reconnect using /connect and approve all requested permissions.';
    } else if (error.statusCode === 429) {
      errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
    }

    await interaction.reply({
      content: errorMessage,
      ephemeral: true
    });
  }
}

async function handleVerify(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const isConnected = userTokens.has(userId);

  await interaction.reply({
    content: isConnected ? '✅ Your Spotify account is connected!' : '❌ Your Spotify account is not connected. Use /connect to link it.',
    ephemeral: true
  });
}

async function handleImage(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const accessToken = userTokens.get(userId);

  if (!accessToken) {
    await interaction.reply({
      content: 'Please connect your Spotify account first using /connect',
      ephemeral: true
    });
    return;
  }

  try {
    await interaction.deferReply(); // Defer the reply to avoid timeout

    spotifyApi.setAccessToken(accessToken);
    const topTracks = await spotifyApi.getMyTopTracks({ limit: 5 });
    
    const tracks = topTracks.body.items.map(track => ({
      name: track.name,
      artist: track.artists[0].name
    }));

    // Generate image prompt using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert at creating detailed image generation prompts that capture the essence of music."
        },
        {
          role: "user",
          content: `Create a detailed prompt for DALL-E to generate an image that represents this music taste:
          ${tracks.map((track, i) => `${i + 1}. ${track.name} by ${track.artist}`).join('\n')}
          
          The prompt should:
          1. Be highly detailed and specific
          2. Capture the mood and style of the music
          3. Be suitable for DALL-E image generation
          4. Be 1-2 sentences long
          5. Focus on creating a cohesive visual representation`
        }
      ],
      temperature: 0.7,
      max_tokens: 200
    });

    const imagePrompt = completion.choices[0].message.content;

    // Generate image using DALL-E
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt!,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid"
    });

    const imageUrl = imageResponse.data[0].url;

    const embed = new EmbedBuilder()
      .setTitle(`🎨 ${interaction.member?.user?.username || interaction.user?.username}'s Music Visualization`)
      .setDescription(`*Generated by your music taste*\n\n**Prompt:** ${imagePrompt}`)
      .setImage(imageUrl || '')
      .setColor(0x1DB954)
      .setFooter({ text: 'Generated with Spotify & OpenAI DALL-E' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] }); // Use editReply for deferred response
  } catch (error: any) {
    console.error('Image error:', error);

    let errorMessage = 'An error occurred while generating your image.';
    if (error.statusCode === 401 || error.statusCode === 403) {
      errorMessage = 'Your Spotify session has expired or you did not grant the required permissions. Please reconnect using /connect and approve all requested permissions.';
    } else if (error.statusCode === 429) {
      errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
    }

    await interaction.editReply({
      content: errorMessage,
      ephemeral: true
    });
  }
}

// Add this helper function at the top level
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        // Exponential backoff
        delay *= 2;
      }
    }
  }
  
  throw lastError;
}

// Update the OAuth callback to use the same environment-aware redirect URI
app.get('/api/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  
  try {
    // Use the same redirect URI logic
    const isLocal = !process.env.VERCEL_URL;
    const redirectUri = isLocal 
      ? 'http://127.0.0.1:3000/api/auth/callback'
      : `https://${process.env.VERCEL_URL}/api/auth/callback`;

    // Set the redirect URI before making the token request
    spotifyApi.setRedirectURI(redirectUri);
    
    const data = await spotifyApi.authorizationCodeGrant(code as string);
    const { access_token, refresh_token } = data.body;
    
    // Store both tokens
    userTokens.set(state as string, access_token);
    userTokens.set(`${state}_refresh`, refresh_token);
    
    res.send(`
      <html>
        <body>
          <h1>Successfully connected!</h1>
          <p>You can close this window and return to Discord.</p>
          <script>
            window.close();
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Auth callback error:', error);
    res.status(500).send(`
      <html>
        <body>
          <h1>Error during authentication</h1>
          <p>Please try again or contact support if the problem persists.</p>
          <script>
            setTimeout(() => window.close(), 5000);
          </script>
        </body>
      </html>
    `);
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).then(async () => {
  console.log('Bot is now online!');
  
  try {
    // Register commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID!),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}).catch((error) => {
  console.error('Failed to login to Discord:', error);
  process.exit(1);
});

// Export for Vercel
export default client;

// Export necessary functions and objects for API routes
export { spotifyApi, userTokens };
