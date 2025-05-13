import { NextResponse } from 'next/server';
import { spotifyApi, getBotToken, getCachedTracks, setCachedTracks } from '../spotify';
import { openai } from '../openai';

interface SpotifyArtist {
  name: string;
}

interface SpotifyTrack {
  name: string;
  artists: SpotifyArtist[];
}

interface SpotifyError {
  statusCode: number;
}

export async function handleProfile(interaction: any) {
  // Immediately respond with a deferred message
  setTimeout(async () => {
    try {
      // Safely extract user info
      const user = interaction.user ?? interaction.member?.user;
      const userId = user?.id;
      const username = user?.username;
      const accessToken = await getBotToken(userId);

      if (!accessToken) {
        await sendFollowup(interaction, {
          content: 'Please connect your Spotify account first using /connect',
          flags: 64,
        });
        return;
      }

      spotifyApi.setAccessToken(accessToken);
      // Check cache first
      const cachedTracks = await getCachedTracks(userId);
      let tracks: SpotifyTrack[];

      if (cachedTracks) {
        tracks = cachedTracks;
      } else {
        // Fetch top tracks
        const topTracks = await spotifyApi.getMyTopTracks({ limit: 10 });
        tracks = topTracks.body.items;
        // Cache the tracks
        await setCachedTracks(userId, tracks);
      }
      // Format tracks for display
      const trackList = tracks
        .map((track: SpotifyTrack) => {
          const artists = track.artists.map(artist => artist.name).join(', ');
          return `**${track.name}** - ${artists}`;
        })
        .join('\n');
      // Generate profile with enhanced prompt
      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are a witty and insightful music critic who creates engaging profiles based on someone's top tracks. \nFocus on identifying patterns, genres, and musical preferences. \nBe specific about the artists and songs mentioned.\nKeep the profile concise (2-3 paragraphs) and engaging.`,
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
      await sendFollowup(interaction, {
        content: `**🎵 ${username}'s Music Nerd Profile**\n\n${profile}\n\n**🎧 Top Tracks**\n${trackList}`,
      });
    } catch (error: unknown) {
      let errorMessage = 'An error occurred while generating your profile.';
      if (error && typeof error === 'object' && 'statusCode' in error) {
        const spotifyError = error as SpotifyError;
        if (spotifyError.statusCode === 401) {
          errorMessage = 'Your Spotify session has expired. Please reconnect using /connect';
        } else if (spotifyError.statusCode === 429) {
          errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
        }
      }
      await sendFollowup(interaction, {
        content: errorMessage,
        flags: 64,
      });
    }
  }, 0);

  // Respond immediately to Discord to avoid timeout
  return NextResponse.json({ type: 5 });
}

// Helper to send a follow-up message to Discord
async function sendFollowup(interaction: any, data: any) {
  const webhookUrl = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
} 