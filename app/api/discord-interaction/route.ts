import { verifyKey } from 'discord-interactions';
import { NextRequest, NextResponse } from 'next/server';
import SpotifyWebApi from 'spotify-web-api-node';
import OpenAI from 'openai';
import { supabase } from '../supabase';
import { enqueueProfileJob, enqueueImageJob } from '../../../queue/profileQueue';

// Validate environment variables
const {
  DISCORD_CLIENT_ID,
  DISCORD_PUBLIC_KEY,
  DISCORD_TOKEN,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  OPENAI_API_KEY,
  VERCEL_URL
} = process.env;

if (!DISCORD_CLIENT_ID || !DISCORD_PUBLIC_KEY || !DISCORD_TOKEN || !SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI || !OPENAI_API_KEY) {
  throw new Error('Missing required environment variables');
}

// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: SPOTIFY_CLIENT_ID!,
  clientSecret: SPOTIFY_CLIENT_SECRET!,
  redirectUri: SPOTIFY_REDIRECT_URI!
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY!,
});

// Add these constants at the top with other constants
const VALID_TIME_RANGES = ['short_term', 'medium_term', 'long_term'] as const;
const DEFAULT_TIME_RANGE = 'short_term';
const DEFAULT_TRACK_LIMIT = '10';

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
  
  // Log the VERCEL_URL for debugging
  console.log(`[handleConnect] VERCEL_URL: ${VERCEL_URL}`);
  console.log(`[handleConnect] Using redirect URI: ${SPOTIFY_REDIRECT_URI}`);
  
  try {
    // Create state object with default values
    const stateData = {
      userId,
      timeRange: DEFAULT_TIME_RANGE,
      trackLimit: DEFAULT_TRACK_LIMIT,
      timestamp: Date.now() // Add timestamp for additional security
    };

    // Encode state as base64 to ensure it's URL-safe
    const stateString = Buffer.from(JSON.stringify(stateData)).toString('base64');
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: SPOTIFY_CLIENT_ID!,
      scope: scopes.join(' '),
      redirect_uri: SPOTIFY_REDIRECT_URI!,
      state: stateString,
      show_dialog: 'true'
    });
    
    const authorizeURL = `https://accounts.spotify.com/authorize?${params.toString()}`;
    console.log(`[handleConnect] Generated auth URL with state:`, {
      statePreview: stateString.substring(0, 20) + '...',
      userId,
      timeRange: DEFAULT_TIME_RANGE
    });
    
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
      console.error('[handleConnect] Error sending DM:', dmError);
      return NextResponse.json({
        type: 4,
        data: {
          content: `Could not send you a DM. Please make sure your DMs are enabled. Here is your link: ${authorizeURL}`,
          flags: 64
        }
      });
    }
  } catch (error) {
    console.error('[handleConnect] Error:', error);
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

  if (error || !data?.access_token) {
    console.log(`[handleVerify] No token found for userId: ${userId}`);
    return NextResponse.json({
      type: 4,
      data: {
        content: '❌ Your Spotify account is not connected. Use /connect to link it.',
        flags: 64
      }
    });
  }

  try {
    // Test the token by making a simple API call
    console.log(`[handleVerify] Testing token validity for userId: ${userId}`);
    spotifyApi.setAccessToken(data.access_token);
    await spotifyApi.getMyTopTracks({ limit: 1 }); // This will throw if token is invalid
    
    console.log(`[handleVerify] Token is valid for userId: ${userId}`);
    return NextResponse.json({
      type: 4,
      data: {
        content: '✅ Your Spotify account is connected and the token is valid!',
        flags: 64
      }
    });
  } catch (error: any) {
    console.error(`[handleVerify] Token validation failed for userId: ${userId}:`, error);
    
    // If token is invalid, we should remove it from the database
    if (error.statusCode === 401 || error.statusCode === 403) {
      console.log(`[handleVerify] Removing invalid token for userId: ${userId}`);
      await supabase
        .from('spotify_tokens')
        .delete()
        .eq('user_id', userId);
      
      return NextResponse.json({
        type: 4,
        data: {
          content: '❌ Your Spotify token has expired. Please use /connect to reconnect your account.',
          flags: 64
        }
      });
    }

    return NextResponse.json({
      type: 4,
      data: {
        content: '❌ There was an error verifying your Spotify connection. Please try /connect again.',
        flags: 64
      }
    });
  }
}

async function getAccessToken(userId: string): Promise<string | null> {
  console.log(`[getAccessToken] Fetching token for userId: ${userId}`);
  const { data, error } = await supabase
    .from('spotify_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .single();
  
  if (error) {
    console.error(`[getAccessToken] Error fetching token:`, error);
    return null;
  }
  
  if (!data?.access_token) {
    console.log(`[getAccessToken] No token found for userId: ${userId}`);
    return null;
  }
  
  console.log(`[getAccessToken] Token found for userId: ${userId}`);
  return data.access_token;
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
  
  // Send deferred response IMMEDIATELY
  const deferredResponse = NextResponse.json({
    type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      flags: 64 // EPHEMERAL
    }
  });

  // Get the access token first
  const accessToken = await getAccessToken(userId);
  if (!accessToken) {
    console.log(`[handleProfile] No access token for userId: ${userId}`);
    // Send follow-up message
    await fetch(`https://discord.com/api/v10/webhooks/${DISCORD_CLIENT_ID}/${interaction.token}/messages/@original`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${DISCORD_TOKEN}`
      },
      body: JSON.stringify({
        content: 'Please connect your Spotify account first using /connect',
        flags: 64
      })
    });
    return deferredResponse;
  }

  try {
    // Enqueue the profile generation job
    await enqueueProfileJob({
      userId,
      username: interaction.member?.user?.username || interaction.user?.username,
      interactionToken: interaction.token,
      applicationId: DISCORD_CLIENT_ID!,
      channelId: interaction.channel_id,
      accessToken
    });

    console.log(`[handleProfile] Enqueued profile generation job for userId: ${userId}`);
  } catch (error) {
    console.error(`[handleProfile] Error enqueueing job for userId: ${userId}:`, error);
    // Send error as follow-up
    await fetch(`https://discord.com/api/v10/webhooks/${DISCORD_CLIENT_ID}/${interaction.token}/messages/@original`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${DISCORD_TOKEN}`
      },
      body: JSON.stringify({
        content: 'An error occurred while queuing your profile generation. Please try again later.',
        flags: 64
      })
    });
  }

  return deferredResponse;
}

async function handleTracks(interaction: any) {
  const userId = interaction.member?.user?.id || interaction.user?.id;
  console.log(`[Command] /tracks used by ${userId}`);
  const accessToken = await getAccessToken(userId);
  
  if (!accessToken) {
    console.log(`[handleTracks] No access token found for userId: ${userId}`);
    return NextResponse.json({
      type: 4,
      data: {
        content: 'Please connect your Spotify account first using /connect',
        flags: 64
      }
    });
  }

  try {
    console.log(`[handleTracks] Setting access token for userId: ${userId}`);
    spotifyApi.setAccessToken(accessToken);
    
    console.log(`[handleTracks] Fetching top tracks for userId: ${userId}`);
    const topTracks: any = await spotifyApi.getMyTopTracks({ limit: 10 });
    
    if (!topTracks.body || !topTracks.body.items || !Array.isArray(topTracks.body.items) || !topTracks.body.items.length) {
      console.log(`[handleTracks] No tracks found for userId: ${userId}`);
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
      console.log(`[handleTracks] Caching ${topTracks.body.items.length} tracks for userId: ${userId}`);
      await setCachedTracks(userId, topTracks.body.items);
    }

    const username = interaction.member?.user?.username || interaction.user?.username || 'User';
    console.log(`[handleTracks] Successfully retrieved tracks for userId: ${userId}`);
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
    console.error(`[handleTracks] Error for userId: ${userId}:`, error);
    console.error(`[handleTracks] Error status code:`, error.statusCode);
    console.error(`[handleTracks] Error message:`, error.message);
    
    let errorMessage = 'An error occurred while fetching your top tracks.';
    if (error.statusCode === 401 || error.statusCode === 403) {
      errorMessage = 'Your Spotify session has expired or you did not grant the required permissions. Please reconnect using /connect and approve all requested permissions.';
      console.log(`[handleTracks] Token expired or invalid for userId: ${userId}`);
    } else if (error.statusCode === 429) {
      errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
      console.log(`[handleTracks] Rate limit hit for userId: ${userId}`);
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
  
  // Send deferred response IMMEDIATELY
  const deferredResponse = NextResponse.json({
    type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      flags: 64 // EPHEMERAL
    }
  });

  // Get the access token first
  const accessToken = await getAccessToken(userId);
  if (!accessToken) {
    console.log(`[handleImage] No access token for userId: ${userId}`);
    // Send follow-up message
    await fetch(`https://discord.com/api/v10/webhooks/${DISCORD_CLIENT_ID}/${interaction.token}/messages/@original`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${DISCORD_TOKEN}`
      },
      body: JSON.stringify({
        content: 'Please connect your Spotify account first using /connect',
        flags: 64
      })
    });
    return deferredResponse;
  }

  try {
    // Enqueue the image generation job
    await enqueueImageJob({
      userId,
      username: interaction.member?.user?.username || interaction.user?.username,
      interactionToken: interaction.token,
      applicationId: DISCORD_CLIENT_ID!,
      channelId: interaction.channel_id,
      accessToken
    });

    console.log(`[handleImage] Enqueued image generation job for userId: ${userId}`);
  } catch (error) {
    console.error(`[handleImage] Error enqueueing job for userId: ${userId}:`, error);
    // Send error as follow-up
    await fetch(`https://discord.com/api/v10/webhooks/${DISCORD_CLIENT_ID}/${interaction.token}/messages/@original`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${DISCORD_TOKEN}`
      },
      body: JSON.stringify({
        content: 'An error occurred while queuing your image generation. Please try again later.',
        flags: 64
      })
    });
  }

  return deferredResponse;
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