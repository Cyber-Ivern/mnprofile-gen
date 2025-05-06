import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, InteractionResponseType } from 'discord.js';
import { config } from 'dotenv';
import express, { Request, Response } from 'express';
import cors from 'cors';
import SpotifyWebApi from 'spotify-web-api-node';
import OpenAI from 'openai';
import { verifyKey } from 'discord-interactions';
import path from 'path';
import fs from 'fs';

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

// Wrap the main bot startup logic in an async IIFE to allow top-level await
(async () => {
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

  // Handle commands (gateway/local)
  client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    try {
      const { commandName } = interaction;
      await interaction.deferReply({ ephemeral: true });
      switch (commandName) {
        case 'connect':
          await handleConnect(interaction, false);
          break;
        case 'profile':
          await handleProfile(interaction, false);
          break;
        case 'tracks':
          await handleTracks(interaction, false);
          break;
        case 'verify':
          await handleVerify(interaction, false);
          break;
        case 'image':
          await handleImage(interaction, false);
          break;
        default:
          await interaction.editReply({ content: 'Unknown command' });
      }
    } catch (error) {
      console.error('Command error:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: 'An error occurred while processing your command.', 
            ephemeral: true 
          });
        } else {
          await interaction.editReply({ 
            content: 'An error occurred while processing your command.'
          });
        }
      } catch (e) {
        console.error('Error handling command error:', e);
      }
    }
  });

  // Helper to send a DM via Discord API (for HTTP/Vercel mode)
  async function sendDMToUser(userId: string, message: string) {
    const discordToken = process.env.DISCORD_TOKEN;
    if (!discordToken) {
      throw new Error('DISCORD_TOKEN is not set');
    }

    // Create DM channel
    const dmChannelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${discordToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ recipient_id: userId })
    });

    if (!dmChannelRes.ok) {
      throw new Error(`Failed to create DM channel: ${await dmChannelRes.text()}`);
    }

    const dmChannel = await dmChannelRes.json();

    // Send message
    const sendMsgRes = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${discordToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content: message })
    });

    if (!sendMsgRes.ok) {
      throw new Error(`Failed to send DM: ${await sendMsgRes.text()}`);
    }
  }

  // Command handlers
  async function handleConnect(interaction: any, isHttp = false) {
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const scopes = [
      'user-top-read',
      'user-read-private',
      'user-read-email'
    ];

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

      if (isHttp) {
        // For HTTP, try to send a DM via Discord API
        try {
          await sendDMToUser(userId, `Click this link to connect your Spotify account: ${authorizeURL}`);
          return {
            content: "I've sent you a DM with the Spotify authorization link! Make sure you have DMs enabled.",
            flags: 64 // ephemeral
          };
        } catch (dmError) {
          console.error('Error sending DM via HTTP:', dmError);
          return {
            content: `Could not send you a DM. Please make sure your DMs are enabled. Here is your link: ${authorizeURL}`,
            flags: 64
          };
        }
      } else {
        // For gateway, try to DM, but catch errors if DMs are closed
        try {
          if (interaction.user && typeof interaction.user.createDM === 'function') {
            const dmChannel = await interaction.user.createDM();
            await dmChannel.send(`Click this link to connect your Spotify account: ${authorizeURL}`);
            return await interaction.editReply({
              content: 'I\'ve sent you a DM with the Spotify authorization link! Make sure you have DMs enabled.',
              ephemeral: true
            });
          } else {
            // Fallback if createDM is not available
            return await interaction.editReply({
              content: `Click this link to connect your Spotify account: ${authorizeURL}`,
              ephemeral: true
            });
          }
        } catch (dmError) {
          console.error('Error sending DM:', dmError);
          return await interaction.editReply({
            content: 'Could not send you a DM. Please make sure your DMs are enabled.',
            ephemeral: true
          });
        }
      }
    } catch (error) {
      console.error('Error in handleConnect:', error);
      if (isHttp) {
        return {
          content: 'An error occurred while processing your request. Please make sure you have DMs enabled.',
          flags: 64
        };
      } else {
        return await interaction.editReply({
          content: 'An error occurred while processing your request. Please make sure you have DMs enabled.',
          ephemeral: true
        });
      }
    }
  }

  async function handleProfile(interaction: any, isHttp = false) {
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const accessToken = userTokens.get(userId);

    if (!accessToken) {
      if (isHttp) {
        return {
          content: 'Please connect your Spotify account first using /connect',
          flags: 64
        };
      } else {
        return await interaction.editReply({
          content: 'Please connect your Spotify account first using /connect',
        });
      }
    }

    try {
      // Check cache first
      const cachedData = userTracksCache.get(userId);
      let tracks: any[] = [];
      
      if (cachedData && (Date.now() - cachedData.timestamp) < CACHE_DURATION) {
        tracks = cachedData.tracks.map((track: any) => ({
          name: track.name,
          artist: track.artists[0].name
        }));
      } else {
        spotifyApi.setAccessToken(accessToken);
        const topTracks: any = await retryOperation(
          () => spotifyApi.getMyTopTracks({ limit: 10 }),
          3,
          1000
        );
        
        tracks = topTracks.body.items.map((track: any) => ({
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
      const trackList = tracks
        .map((track: any, index: number) => `${index + 1}. **${track.name}** - ${track.artist}`)
        .join('\n');

      // Generate profile analysis using OpenAI
      const completion = await retryOperation(
        () => openai.chat.completions.create({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: `You are a witty and insightful music critic who creates engaging profiles based on someone's top tracks. \nFocus on identifying patterns, genres, and musical preferences. \nBe specific about the artists and songs mentioned.\nKeep the profile concise (2-3 paragraphs) and engaging.\nFormat the response with emojis and markdown for better readability.\nInclude a fun title for the profile.`
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

      if (isHttp) {
        return {
          embeds: [embed]
        };
      } else {
        return await interaction.editReply({ embeds: [embed] });
      }
    } catch (error: any) {
      let errorMessage = 'An error occurred while generating your profile.';
      if (error.statusCode === 401) {
        errorMessage = 'Your Spotify session has expired. Please reconnect using /connect';
      } else if (error.statusCode === 429) {
        errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
      }

      if (isHttp) {
        return {
          content: errorMessage,
          flags: 64
        };
      } else {
        return await interaction.editReply({
          content: errorMessage,
        });
      }
    }
  }

  async function handleTracks(interaction: any, isHttp = false) {
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const accessToken = userTokens.get(userId);

    if (!accessToken) {
      if (isHttp) {
        return {
          content: 'Please connect your Spotify account first using /connect',
          flags: 64
        };
      } else {
        return await interaction.editReply({
          content: 'Please connect your Spotify account first using /connect',
          ephemeral: true
        });
      }
    }

    try {
      spotifyApi.setAccessToken(accessToken);
      const topTracks: any = await spotifyApi.getMyTopTracks({ limit: 10 });

      if (!topTracks.body || !topTracks.body.items || !Array.isArray(topTracks.body.items) || !topTracks.body.items.length) {
        if (isHttp) {
          return {
            content: 'No top tracks found for your Spotify account.',
            flags: 64
          };
        } else {
          return await interaction.editReply({
            content: 'No top tracks found for your Spotify account.',
            ephemeral: true
          });
        }
      }

      // Store tracks in cache
      userTracksCache.set(userId, {
        tracks: topTracks.body.items,
        timestamp: Date.now()
      });

      const username = interaction.member?.user?.username || interaction.user?.username || 'User';
      const embed = new EmbedBuilder()
        .setTitle(`${username}'s Top Tracks`)
        .setDescription(topTracks.body.items
          .map((track: any, index: number) => `${index + 1}. ${track.name} - ${track.artists[0].name}`)
          .join('\n'))
        .setColor(0x1DB954)
        .setTimestamp();

      if (isHttp) {
        return {
          embeds: [embed]
        };
      } else {
        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error: any) {
      console.error('Tracks error:', error);

      let errorMessage = 'An error occurred while fetching your top tracks.';
      if (error.statusCode === 401 || error.statusCode === 403) {
        errorMessage = 'Your Spotify session has expired or you did not grant the required permissions. Please reconnect using /connect and approve all requested permissions.';
      } else if (error.statusCode === 429) {
        errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
      }

      if (isHttp) {
        return {
          content: errorMessage,
          flags: 64
        };
      } else {
        await interaction.editReply({
          content: errorMessage,
          ephemeral: true
        });
      }
    }
  }

  async function handleVerify(interaction: any, isHttp = false) {
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const isConnected = userTokens.has(userId);

    if (isHttp) {
      return {
        content: isConnected ? '✅ Your Spotify account is connected!' : '❌ Your Spotify account is not connected. Use /connect to link it.',
        flags: 64
      };
    } else {
      return await interaction.editReply({
        content: isConnected ? '✅ Your Spotify account is connected!' : '❌ Your Spotify account is not connected. Use /connect to link it.'
      });
    }
  }

  async function handleImage(interaction: any, isHttp = false) {
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const accessToken = userTokens.get(userId);

    if (!accessToken) {
      if (isHttp) {
        return {
          content: 'Please connect your Spotify account first using /connect',
          flags: 64
        };
      } else {
        return await interaction.editReply({
          content: 'Please connect your Spotify account first using /connect',
        });
      }
    }

    try {
      spotifyApi.setAccessToken(accessToken);
      const topTracks: any = await spotifyApi.getMyTopTracks({ limit: 5 });
      
      const tracks = topTracks.body.items.map((track: any) => ({
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
            content: `Create a detailed prompt for DALL-E to generate an image that represents this music taste:\n${tracks.map((track: any, i: number) => `${i + 1}. ${track.name} by ${track.artist}`).join('\\n')}\n\nThe prompt should:\n1. Be highly detailed and specific\n2. Capture the mood and style of the music\n3. Be suitable for DALL-E image generation\n4. Be 1-2 sentences long\n5. Focus on creating a cohesive visual representation`
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

      if (isHttp) {
        return {
          embeds: [embed]
        };
      } else {
        return await interaction.editReply({ embeds: [embed] });
      }
    } catch (error: any) {
      let errorMessage = 'An error occurred while generating your image.';
      if (error.statusCode === 401 || error.statusCode === 403) {
        errorMessage = 'Your Spotify session has expired or you did not grant the required permissions. Please reconnect using /connect and approve all requested permissions.';
      } else if (error.statusCode === 429) {
        errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
      }

      if (isHttp) {
        return {
          content: errorMessage,
          flags: 64
        };
      } else {
        return await interaction.editReply({
          content: errorMessage,
        });
      }
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
      const isLocal = !process.env.VERCEL;
      const redirectUri = isLocal 
        ? 'http://127.0.0.1:3000/api/auth/callback'
        : `https://${process.env.VERCEL_URL}/api/auth/callback`;

      // Implement Spotify authorization code grant/token exchange
      const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(
            process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
          ).toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: redirectUri
        })
      });
      const data = await tokenResponse.json();
      const { access_token, refresh_token } = data;

      // Save the tokens for the user
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
})();
