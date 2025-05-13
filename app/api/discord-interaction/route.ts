import { verifyKey } from 'discord-interactions';
import { NextRequest, NextResponse } from 'next/server';
import SpotifyWebApi from 'spotify-web-api-node';
import OpenAI from 'openai';
import { supabase } from '../supabase';

// Validate environment variables
const {
  DISCORD_CLIENT_ID,
  DISCORD_PUBLIC_KEY,
  DISCORD_TOKEN,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  OPENAI_API_KEY,
  VERCEL_URL
} = process.env;

if (!DISCORD_CLIENT_ID || !DISCORD_PUBLIC_KEY || !DISCORD_TOKEN || !SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !OPENAI_API_KEY) {
  throw new Error('Missing required environment variables');
}

// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: SPOTIFY_CLIENT_ID!,
  clientSecret: SPOTIFY_CLIENT_SECRET!,
  redirectUri: VERCEL_URL
    ? `https://${VERCEL_URL}/api/auth/callback`
    : 'http://127.0.0.1:3000/api/auth/callback'
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY!,
});

// Helper to send a DM via Discord API
async function sendDMToUser(userId: string, message: string) {
  if (!DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is not set');
  // Create DM channel
  const dmChannelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${DISCORD_TOKEN}`,
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
      'Authorization': `Bot ${DISCORD_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content: message })
  });
  if (!sendMsgRes.ok) throw new Error(`Failed to send DM: ${await sendMsgRes.text()}`);
}

// Command handlers
async function handleConnect(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  console.log(`[Command] /connect used by ${userId}`);
  const scopes = [
    'user-top-read',
    'user-read-private',
    'user-read-email'
  ];
  const redirectUri = VERCEL_URL
    ? `https://${VERCEL_URL}/api/auth/callback`
    : 'http://127.0.0.1:3000/api/auth/callback';
  try {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: SPOTIFY_CLIENT_ID!,
      scope: scopes.join(' '),
      redirect_uri: redirectUri,
      state: userId,
      show_dialog: 'true'
    });
    const authorizeURL = `https://accounts.spotify.com/authorize?${params.toString()}`;
    try {
      await sendDMToUser(userId, `Click this link to connect your Spotify account: ${authorizeURL}`);
      return NextResponse.json({
        type: 4,
        data: {
          content: "I've sent you a DM with the Spotify authorization link! Make sure you have DMs enabled.",
          flags: 64
        }
      });
    } catch (dmError) {
      console.error('Error sending DM via HTTP:', dmError);
      return NextResponse.json({
        type: 4,
        data: {
          content: `Could not send you a DM. Please make sure your DMs are enabled. Here is your link: ${authorizeURL}`,
          flags: 64
        }
      });
    }
  } catch (error) {
    console.error('Error in handleConnect:', error);
    return NextResponse.json({
      type: 4,
      data: {
        content: 'An error occurred while processing your request. Please make sure you have DMs enabled.',
        flags: 64
      }
    });
  }
}

async function handleVerify(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  console.log(`[Command] /verify used by ${userId}`);
  // Query Supabase for the token
  const { data, error } = await supabase
    .from('spotify_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .single();
  const isConnected = !!data?.access_token;
  return NextResponse.json({
    type: 4,
    data: {
      content: isConnected ? '✅ Your Spotify account is connected!' : '❌ Your Spotify account is not connected. Use /connect to link it.',
      flags: 64
    }
  });
}

async function getAccessToken(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('spotify_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .single();
  return data?.access_token || null;
}

async function setAccessToken(userId: string, accessToken: string) {
  await supabase.from('spotify_tokens').upsert({ user_id: userId, access_token: accessToken });
}

async function getCachedTracks(userId: string): Promise<any[] | null> {
  const { data, error } = await supabase
    .from('track_cache')
    .select('tracks, created_at')
    .eq('user_id', userId)
    .single();
  if (!data) return null;
  // Check if cache is expired (older than 5 minutes)
  const cacheTime = new Date(data.created_at).getTime();
  if (Date.now() - cacheTime > 5 * 60 * 1000) {
    // Optionally delete expired cache
    await supabase.from('track_cache').delete().eq('user_id', userId);
    return null;
  }
  return data.tracks;
}

async function setCachedTracks(userId: string, tracks: any[]) {
  await supabase.from('track_cache').upsert({ user_id: userId, tracks });
}

async function handleProfile(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  console.log(`[Command] /profile used by ${userId}`);
  console.log(`[handleProfile] Called for userId: ${userId}`);
  const accessToken = await getAccessToken(userId);
  if (!accessToken) {
    console.log(`[handleProfile] No access token for userId: ${userId}`);
    return NextResponse.json({
      type: 4,
      data: {
        content: 'Please connect your Spotify account first using /connect',
        flags: 64
      }
    });
  }
  try {
    // Check cache first
    let tracks = await getCachedTracks(userId);
    if (!tracks) {
      spotifyApi.setAccessToken(accessToken);
      const topTracks: any = await spotifyApi.getMyTopTracks({ limit: 10 });
      tracks = topTracks.body.items.map((track: any) => ({
        name: track.name,
        artist: track.artists[0].name
      }));
      // Ensure tracks is an array before caching
      if (Array.isArray(tracks)) {
        await setCachedTracks(userId, tracks);
      }
      console.log(`[handleProfile] Fetched tracks from Spotify for userId: ${userId}`);
    } else {
      console.log(`[handleProfile] Using cached tracks for userId: ${userId}`);
    }
    // Ensure tracks is an array for the rest of the function
    if (!Array.isArray(tracks)) tracks = [];
    const displayName = interaction.member?.user?.username || interaction.user?.username;
    const trackList = tracks
      .map((track: any, index: number) => `${index + 1}. **${track.name}** - ${track.artist}`)
      .join('\n');
    console.log(`[handleProfile] Sending request to OpenAI for userId: ${userId}`);
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
    console.log(`[handleProfile] OpenAI response received for userId: ${userId}`);
    const profile = completion.choices[0].message.content;
    return NextResponse.json({
      type: 4,
      data: {
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
      }
    });
  } catch (error: any) {
    console.error(`[handleProfile] Error for userId: ${userId}`, error);
    let errorMessage = 'An error occurred while generating your profile.';
    if (error.statusCode === 401) {
      errorMessage = 'Your Spotify session has expired. Please reconnect using /connect';
    } else if (error.statusCode === 429) {
      errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
    }
    return NextResponse.json({
      type: 4,
      data: {
        content: errorMessage,
        flags: 64
      }
    });
  }
}

async function handleTracks(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  console.log(`[Command] /tracks used by ${userId}`);
  const accessToken = await getAccessToken(userId);
  if (!accessToken) {
    return NextResponse.json({
      type: 4,
      data: {
        content: 'Please connect your Spotify account first using /connect',
        flags: 64
      }
    });
  }
  try {
    spotifyApi.setAccessToken(accessToken);
    const topTracks: any = await spotifyApi.getMyTopTracks({ limit: 10 });
    if (!topTracks.body || !topTracks.body.items || !Array.isArray(topTracks.body.items) || !topTracks.body.items.length) {
      return NextResponse.json({
        type: 4,
        data: {
          content: 'No top tracks found for your Spotify account.',
          flags: 64
        }
      });
    }
    // Only cache if we have valid tracks
    if (Array.isArray(topTracks.body.items)) {
      await setCachedTracks(userId, topTracks.body.items);
    }
    const username = interaction.member?.user?.username || interaction.user?.username || 'User';
    return NextResponse.json({
      type: 4,
      data: {
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
      }
    });
  } catch (error: any) {
    let errorMessage = 'An error occurred while fetching your top tracks.';
    if (error.statusCode === 401 || error.statusCode === 403) {
      errorMessage = 'Your Spotify session has expired or you did not grant the required permissions. Please reconnect using /connect and approve all requested permissions.';
    } else if (error.statusCode === 429) {
      errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
    }
    return NextResponse.json({
      type: 4,
      data: {
        content: errorMessage,
        flags: 64
      }
    });
  }
}

async function handleImage(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  console.log(`[Command] /image used by ${userId}`);
  console.log(`[handleImage] Called for userId: ${userId}`);
  const accessToken = await getAccessToken(userId);
  if (!accessToken) {
    console.log(`[handleImage] No access token for userId: ${userId}`);
    return NextResponse.json({
      type: 4,
      data: {
        content: 'Please connect your Spotify account first using /connect',
        flags: 64
      }
    });
  }
  try {
    spotifyApi.setAccessToken(accessToken);
    const topTracks: any = await spotifyApi.getMyTopTracks({ limit: 5 });
    const tracks = topTracks.body.items.map((track: any) => ({
      name: track.name,
      artist: track.artists[0].name
    }));
    console.log(`[handleImage] Sending request to OpenAI for userId: ${userId}`);
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
    console.log(`[handleImage] OpenAI prompt response received for userId: ${userId}`);
    const imagePrompt = completion.choices[0].message.content;
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: imagePrompt!,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid"
    });
    console.log(`[handleImage] DALL-E image generated for userId: ${userId}`);
    const imageUrl = imageResponse.data[0].url;
    return NextResponse.json({
      type: 4,
      data: {
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
      }
    });
  } catch (error: any) {
    console.error(`[handleImage] Error for userId: ${userId}`, error);
    let errorMessage = 'An error occurred while generating your image.';
    if (error.statusCode === 401 || error.statusCode === 403) {
      errorMessage = 'Your Spotify session has expired or you did not grant the required permissions. Please reconnect using /connect and approve all requested permissions.';
    } else if (error.statusCode === 429) {
      errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
    }
    return NextResponse.json({
      type: 4,
      data: {
        content: errorMessage,
        flags: 64
      }
    });
  }
}

// Verify Discord interaction
function verifyDiscordRequest(clientKey: string, body: Uint8Array, signature: string, timestamp: string) {
  return verifyKey(body, signature, timestamp, clientKey);
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-signature-ed25519');
  const timestamp = req.headers.get('x-signature-timestamp');

  if (!signature || !timestamp) {
    return NextResponse.json({ error: 'Invalid request signature' }, { status: 401 });
  }

  // 1. Read the raw body as Uint8Array
  const rawBody = new Uint8Array(await req.arrayBuffer());

  // 2. Verify the request using the raw body
  const isValidRequest = verifyDiscordRequest(
    DISCORD_PUBLIC_KEY!,
    rawBody,
    signature,
    timestamp
  );

  if (!isValidRequest) {
    return NextResponse.json({ error: 'Invalid request signature' }, { status: 401 });
  }

  // 3. Parse the body only after verification
  const body = JSON.parse(Buffer.from(rawBody).toString('utf-8'));

  const interaction = body;

  // Add logging for received interactions
  console.log('Received interaction:', JSON.stringify(interaction, null, 2));

  // Handle Discord ping
  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // Handle commands
  if (interaction.type === 2) {
    const { name } = interaction.data;
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const username = interaction.member?.user?.username || interaction.user?.username;
    const guildId = interaction.guild_id;
    const channelId = interaction.channel_id;

    // Log command usage with detailed context
    console.log(`[Command Usage] Command: /${name} | User: ${username} (${userId}) | Guild: ${guildId} | Channel: ${channelId}`);

    try {
      switch (name) {
        case 'connect':
          return await handleConnect(interaction);
        case 'profile':
          return await handleProfile(interaction);
        case 'tracks':
          return await handleTracks(interaction);
        case 'verify':
          return await handleVerify(interaction);
        case 'image':
          return await handleImage(interaction);
        default:
          return NextResponse.json({ error: 'Unknown command' }, { status: 400 });
      }
    } catch (error: unknown) {
      console.error('Error handling command:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown interaction type' }, { status: 400 });
} 