import { config } from 'dotenv';
import { verifyKey } from 'discord-interactions';
import SpotifyWebApi from 'spotify-web-api-node';
import OpenAI from 'openai';

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

// Command handlers
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
    const topTracks: any = await spotifyApi.getMyTopTracks({ limit: 10 });
    if (!topTracks.body || !topTracks.body.items || !Array.isArray(topTracks.body.items) || !topTracks.body.items.length) {
      return {
        content: 'No top tracks found for your Spotify account.',
        flags: 64
      };
    }
    const trackList = topTracks.body.items
      .map((track: any) => `${track.name} by ${track.artists[0].name}`)
      .join(', ');
    const completion = await openai.images.generate({
      model: "dall-e-3",
      prompt: `Create a vibrant, artistic album cover that represents these songs: ${trackList}. The image should be abstract and colorful, with musical elements.`,
      n: 1,
      size: "1024x1024"
    });
    const imageUrl = completion.data[0].url;
    if (!imageUrl) {
      throw new Error('No image URL returned from OpenAI');
    }
    return {
      embeds: [
        {
          title: '🎨 Your Music-Inspired Artwork',
          description: 'Generated based on your top tracks',
          image: { url: imageUrl },
          color: 0x1DB954,
          timestamp: new Date().toISOString()
        }
      ]
    };
  } catch (error: any) {
    let errorMessage = 'An error occurred while generating your image.';
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

// Main handler for Discord interactions
export default async function handler(req: any, res: any) {
  // Verify the request is from Discord
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  const body = JSON.stringify(req.body);
  const isValidRequest = verifyKey(body, signature, timestamp, process.env.DISCORD_PUBLIC_KEY!);

  if (!isValidRequest) {
    return res.status(401).json({ error: 'Invalid request signature' });
  }

  // Handle Discord's verification request
  if (req.body.type === 1) {
    return res.status(200).json({ type: 1 });
  }

  // Handle commands
  const { type, data } = req.body;
  if (type === 2) { // Application Command
    const command = data.name;
    let response;

    switch (command) {
      case 'connect':
        response = await handleConnect(req.body);
        break;
      case 'profile':
        response = await handleProfile(req.body);
        break;
      case 'tracks':
        response = await handleTracks(req.body);
        break;
      case 'verify':
        response = await handleVerify(req.body);
        break;
      case 'image':
        response = await handleImage(req.body);
        break;
      default:
        response = {
          content: 'Unknown command',
          flags: 64
        };
    }

    return res.status(200).json({
      type: 4,
      data: response
    });
  }

  // Handle other interaction types if needed
  return res.status(400).json({ error: 'Unsupported interaction type' });
} 