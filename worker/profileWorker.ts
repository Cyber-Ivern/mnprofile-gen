import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { OpenAI } from 'openai';
import SpotifyWebApi from 'spotify-web-api-node';
import { supabase } from '../app/api/supabase';
import { ProfileJobData, ImageJobData } from '../queue/profileQueue';
import fetch from 'node-fetch';
import express from 'express';

// Create a simple express app for health checks
const app = express();
const port = process.env.PORT || 3001;

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Start the health check server
const server = app.listen(port, () => {
  console.log(`Health check server listening on port ${port}`);
});

// Validate all required environment variables
const requiredEnvVars = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_PASSWORD',
  'OPENAI_API_KEY',
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'DISCORD_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY'
] as const;

// Check for missing environment variables
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// Initialize Redis connection with retry logic
let connection: IORedis;
let retryCount = 0;
const maxRetries = 5;
const retryDelay = 5000; // 5 seconds

async function initializeRedis() {
  try {
    connection = new IORedis(process.env.UPSTASH_REDIS_REST_URL!, {
      password: process.env.UPSTASH_REDIS_PASSWORD!,
      tls: {},
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        if (times > 3) {
          return null; // Stop retrying after 3 attempts
        }
        return Math.min(times * 1000, 3000); // Exponential backoff
      }
    });

    // Test the connection
    await connection.ping();
    console.log('Successfully connected to Redis');
    return true;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    if (retryCount < maxRetries) {
      retryCount++;
      console.log(`Retrying Redis connection (${retryCount}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return initializeRedis();
    }
    throw error;
  }
}

// Initialize APIs
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID!,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/api/callback'
});

// Declare workers at the top level
let profileWorker: Worker;
let imageWorker: Worker;

async function sendDiscordFollowup(applicationId: string, interactionToken: string, content: string, embeds?: any[]) {
  const webhookUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;
  await fetch(webhookUrl, {
    method: 'PATCH',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
    },
    body: JSON.stringify({ 
      content,
      embeds,
      flags: 64 // EPHEMERAL
    }),
  });
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
    await supabase.from('track_cache').delete().eq('user_id', userId);
    return null;
  }
  return data.tracks;
}

async function setCachedTracks(userId: string, tracks: any[]) {
  await supabase.from('track_cache').upsert({ user_id: userId, tracks });
}

// Graceful shutdown function
async function shutdown(signal: string) {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close the health check server
    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log('Health check server closed');
        resolve();
      });
    });

    // Close Redis connection
    if (connection) {
      await connection.quit();
      console.log('Redis connection closed');
    }

    // Close workers
    if (profileWorker && imageWorker) {
      await Promise.all([
        profileWorker.close(),
        imageWorker.close()
      ]);
      console.log('Workers closed');
    }

    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start the worker
async function start() {
  try {
    // Initialize Redis first
    await initializeRedis();

    // Create workers
    profileWorker = new Worker('profile-generation', async (job) => {
      const data = job.data as ProfileJobData;
      const { userId, username, interactionToken, applicationId, accessToken } = data;

      try {
        // Get tracks (from cache or Spotify)
        let tracks: any[] = [];
        const cachedTracks = await getCachedTracks(userId);
        if (cachedTracks) {
          tracks = cachedTracks;
        } else {
          spotifyApi.setAccessToken(accessToken);
          const topTracks: any = await spotifyApi.getMyTopTracks({ limit: 10 });
          tracks = topTracks.body.items.map((track: any) => ({
            name: track.name,
            artist: track.artists[0].name
          }));
          if (tracks.length > 0) {
            await setCachedTracks(userId, tracks);
          }
        }

        if (tracks.length === 0) {
          throw new Error('No tracks found for user');
        }

        const trackList = tracks
          .map((track: any, index: number) => `${index + 1}. **${track.name}** - ${track.artist}`)
          .join('\n');

        // Generate profile with OpenAI
        const completion = await openai.chat.completions.create({
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
        });

        const profile = completion.choices[0].message.content;

        // Send the profile to Discord
        await sendDiscordFollowup(applicationId, interactionToken, '', [{
          title: `🎵 ${username}'s Music Nerd Profile`,
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
        }]);

      } catch (error: any) {
        console.error(`[Profile Worker] Error for userId ${userId}:`, error);
        let errorMessage = 'An error occurred while generating your profile.';
        if (error.statusCode === 401) {
          errorMessage = 'Your Spotify session has expired. Please reconnect using /connect';
        } else if (error.statusCode === 429) {
          errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
        }
        await sendDiscordFollowup(applicationId, interactionToken, errorMessage);
        throw error; // Rethrow to trigger retry
      }
    }, { connection });

    imageWorker = new Worker('image-generation', async (job) => {
      const data = job.data as ImageJobData;
      const { userId, username, interactionToken, applicationId, accessToken } = data;

      try {
        // Get tracks (from cache or Spotify)
        let tracks: any[] = [];
        const cachedTracks = await getCachedTracks(userId);
        if (cachedTracks) {
          tracks = cachedTracks;
        } else {
          spotifyApi.setAccessToken(accessToken);
          const topTracks: any = await spotifyApi.getMyTopTracks({ limit: 5 });
          tracks = topTracks.body.items.map((track: any) => ({
            name: track.name,
            artist: track.artists[0].name
          }));
          if (tracks.length > 0) {
            await setCachedTracks(userId, tracks);
          }
        }

        if (tracks.length === 0) {
          throw new Error('No tracks found for user');
        }

        // Generate image prompt with OpenAI
        const completion = await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: "You are an expert at creating detailed image generation prompts that capture the essence of music."
            },
            {
              role: "user",
              content: `Create a detailed prompt for DALL-E to generate an image that represents this music taste:\n${tracks.map((track: any, i: number) => `${i + 1}. ${track.name} by ${track.artist}`).join('\n')}\n\nThe prompt should:\n1. Be highly detailed and specific\n2. Capture the mood and style of the music\n3. Be suitable for DALL-E image generation\n4. Be 1-2 sentences long\n5. Focus on creating a cohesive visual representation`
            }
          ],
          temperature: 0.7,
          max_tokens: 200
        });

        const imagePrompt = completion.choices[0].message.content;

        // Generate image with DALL-E
        const imageResponse = await openai.images.generate({
          model: "dall-e-3",
          prompt: imagePrompt!,
          n: 1,
          size: "1024x1024",
          quality: "standard",
          style: "vivid"
        });

        const imageUrl = imageResponse.data[0].url;

        // Send the image to Discord
        await sendDiscordFollowup(applicationId, interactionToken, '', [{
          title: `🎨 ${username}'s Music Visualization`,
          description: `*Generated by your music taste*\n\n**Prompt:** ${imagePrompt}`,
          image: { url: imageUrl || '' },
          color: 0x1DB954,
          footer: { text: 'Generated with Spotify & OpenAI DALL-E' },
          timestamp: new Date().toISOString()
        }]);

      } catch (error: any) {
        console.error(`[Image Worker] Error for userId ${userId}:`, error);
        let errorMessage = 'An error occurred while generating your image.';
        if (error.statusCode === 401) {
          errorMessage = 'Your Spotify session has expired. Please reconnect using /connect';
        } else if (error.statusCode === 429) {
          errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
        }
        await sendDiscordFollowup(applicationId, interactionToken, errorMessage);
        throw error; // Rethrow to trigger retry
      }
    }, { connection });

    // Add event listeners for both workers
    [profileWorker, imageWorker].forEach(worker => {
      worker.on('completed', job => {
        console.log(`Job ${job.id} completed successfully!`);
      });

      worker.on('failed', (job, err) => {
        console.error(`Job ${job?.id} failed:`, err);
      });

      worker.on('error', err => {
        console.error('Worker error:', err);
      });
    });

    console.log('Workers started successfully');
  } catch (error) {
    console.error('Failed to start workers:', error);
    process.exit(1);
  }
}

// Start the application
start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
}); 