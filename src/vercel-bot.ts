import { config } from 'dotenv';
import express, { Request, Response } from 'express';
import cors from 'cors';
import SpotifyWebApi from 'spotify-web-api-node';
import OpenAI from 'openai';
import { verifyKey } from 'discord-interactions';

// Load environment variables
config();

// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID!,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
  redirectUri: process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/api/auth/callback`
    : 'http://127.0.0.1:3000/api/auth/callback'
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Initialize Express server for OAuth callback
const app = express();
app.use(cors());
app.use(express.json());

// In-memory user token store (not persistent on Vercel, for demo only)
const userTokens = new Map<string, string>();
const userTracksCache = new Map<string, { tracks: any[], timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper to send a DM via Discord API
async function sendDMToUser(userId: string, message: string) {
  const discordToken = process.env.DISCORD_TOKEN;
  if (!discordToken) throw new Error('DISCORD_TOKEN is not set');
  // Create DM channel
  const dmChannelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${discordToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ recipient_id: userId })
  });
  if (!dmChannelRes.ok) throw new Error(`Failed to create DM channel: ${await dmChannelRes.text()}`);
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
  if (!sendMsgRes.ok) throw new Error(`Failed to send DM: ${await sendMsgRes.text()}`);
}

// Command handlers (HTTP only)
async function handleConnect(interaction: any) {
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
    try {
      await sendDMToUser(userId, `Click this link to connect your Spotify account: ${authorizeURL}`);
      return {
        content: "I've sent you a DM with the Spotify authorization link! Make sure you have DMs enabled.",
        flags: 64
      };
    } catch (dmError) {
      console.error('Error sending DM via HTTP:', dmError);
      return {
        content: `Could not send you a DM. Please make sure your DMs are enabled. Here is your link: ${authorizeURL}`,
        flags: 64
      };
    }
  } catch (error) {
    console.error('Error in handleConnect:', error);
    return {
      content: 'An error occurred while processing your request. Please make sure you have DMs enabled.',
      flags: 64
    };
  }
}

async function handleProfile(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const accessToken = userTokens.get(userId);
  if (!accessToken) {
    return {
      content: 'Please connect your Spotify account first using /connect',
      flags: 64
    };
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
      const topTracks: any = await spotifyApi.getMyTopTracks({ limit: 10 });
      tracks = topTracks.body.items.map((track: any) => ({
        name: track.name,
        artist: track.artists[0].name
      }));
      userTracksCache.set(userId, {
        tracks: topTracks.body.items,
        timestamp: Date.now()
      });
    }
    const displayName = interaction.member?.user?.username || interaction.user?.username;
    const trackList = tracks
      .map((track: any, index: number) => `${index + 1}. **${track.name}** - ${track.artist}`)
      .join('\n');
    const completion = await openai.chat.completions.create({
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
    });
    const profile = completion.choices[0].message.content;
    return {
      embeds: [
        {
          title: `🎵 ${displayName}'s Music Nerd Profile`,
          description: profile,
          fields: [
            {
              name: '🎧 Top Tracks',
              value: trackList
            }
          ],
          color: 0x1DB954,
          footer: { text: 'Generated with Spotify & OpenAI' },
          timestamp: new Date().toISOString()
        }
      ]
    };
  } catch (error: any) {
    let errorMessage = 'An error occurred while generating your profile.';
    if (error.statusCode === 401) {
      errorMessage = 'Your Spotify session has expired. Please reconnect using /connect';
    } else if (error.statusCode === 429) {
      errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
    }
    return {
      content: errorMessage,
      flags: 64
    };
  }
}

async function handleTracks(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const accessToken = userTokens.get(userId);
  if (!accessToken) {
    return {
      content: 'Please connect your Spotify account first using /connect',
      flags: 64
    };
  }
  try {
    spotifyApi.setAccessToken(accessToken);
    const topTracks: any = await spotifyApi.getMyTopTracks({ limit: 10 });
    if (!topTracks.body || !topTracks.body.items || !Array.isArray(topTracks.body.items) || !topTracks.body.items.length) {
      return {
        content: 'No top tracks found for your Spotify account.',
        flags: 64
      };
    }
    userTracksCache.set(userId, {
      tracks: topTracks.body.items,
      timestamp: Date.now()
    });
    const username = interaction.member?.user?.username || interaction.user?.username || 'User';
    return {
      embeds: [
        {
          title: `${username}'s Top Tracks`,
          description: topTracks.body.items
            .map((track: any, index: number) => `${index + 1}. ${track.name} - ${track.artists[0].name}`)
            .join('\n'),
          color: 0x1DB954,
          timestamp: new Date().toISOString()
        }
      ]
    };
  } catch (error: any) {
    let errorMessage = 'An error occurred while fetching your top tracks.';
    if (error.statusCode === 401 || error.statusCode === 403) {
      errorMessage = 'Your Spotify session has expired or you did not grant the required permissions. Please reconnect using /connect and approve all requested permissions.';
    } else if (error.statusCode === 429) {
      errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
    }
    return {
      content: errorMessage,
      flags: 64
    };
  }
}

async function handleVerify(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const isConnected = userTokens.has(userId);
  return {
    content: isConnected ? '✅ Your Spotify account is connected!' : '❌ Your Spotify account is not connected. Use /connect to link it.',
    flags: 64
  };
}

async function handleImage(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  const accessToken = userTokens.get(userId);
  if (!accessToken) {
    return {
      content: 'Please connect your Spotify account first using /connect',
      flags: 64
    };
  }
  try {
    spotifyApi.setAccessToken(accessToken);
    const topTracks: any = await spotifyApi.getMyTopTracks({ limit: 5 });
    const tracks = topTracks.body.items.map((track: any) => ({
      name: track.name,
      artist: track.artists[0].name
    }));
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
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt!,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid"
    });
    const imageUrl = imageResponse.data[0].url;
    return {
      embeds: [
        {
          title: `🎨 ${interaction.member?.user?.username || interaction.user?.username}'s Music Visualization`,
          description: `*Generated by your music taste*\n\n**Prompt:** ${imagePrompt}`,
          image: { url: imageUrl || '' },
          color: 0x1DB954,
          footer: { text: 'Generated with Spotify & OpenAI DALL-E' },
          timestamp: new Date().toISOString()
        }
      ]
    };
  } catch (error: any) {
    let errorMessage = 'An error occurred while generating your image.';
    if (error.statusCode === 401 || error.statusCode === 403) {
      errorMessage = 'Your Spotify session has expired or you did not grant the required permissions. Please reconnect using /connect and approve all requested permissions.';
    } else if (error.statusCode === 429) {
      errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
    }
    return {
      content: errorMessage,
      flags: 64
    };
  }
}

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
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const body = JSON.stringify(req.body);
  if (!signature || !timestamp) {
    return sendError(401, 'Missing signature or timestamp');
  }
  try {
    const isValid = verifyKey(body, signature as string, timestamp as string, process.env.DISCORD_PUBLIC_KEY!);
    if (!isValid) {
      return sendError(401, 'Invalid signature');
    }
    if (req.body.type === 1) {
      return sendResponse({ type: 1 });
    }
    const interaction = req.body;
    if (interaction.type === 2) {
      const commandName = interaction.data.name;
      sendResponse({ type: 5 }); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
      (async () => {
        let response;
        try {
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
              response = {
                content: 'Unknown command',
                flags: 64
              };
          }
        } catch (error) {
          response = {
            content: 'An error occurred while processing your command.',
            flags: 64
          };
        }
        await fetch(`https://discord.com/api/v10/webhooks/${process.env.DISCORD_CLIENT_ID}/${interaction.token}/messages/@original`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            (response && 'embeds' in response && response.embeds)
              ? { embeds: response.embeds }
              : { content: response.content, flags: response.flags }
          )
        });
      })();
      return;
    }
    return sendResponse({
      type: 4,
      data: {
        content: 'Unhandled interaction type',
        flags: 64
      }
    });
  } catch (error) {
    return sendError(401, 'Verification failed');
  }
});

// Spotify OAuth callback
app.get('/api/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  try {
    const isLocal = !process.env.VERCEL;
    const redirectUri = isLocal
      ? 'http://127.0.0.1:3000/api/auth/callback'
      : `https://${process.env.VERCEL_URL}/api/auth/callback`;
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

// Start the server (for local dev, not used on Vercel)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app; 