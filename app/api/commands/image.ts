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

export async function handleImage(interaction: any) {
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
        const topTracks = await spotifyApi.getMyTopTracks({ limit: 5 });
        tracks = topTracks.body.items;
        // Cache the tracks
        await setCachedTracks(userId, tracks);
      }
      const trackList = tracks
        .map((track: SpotifyTrack) => `${track.name} by ${track.artists[0].name}`)
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
            content: `Create a detailed, artistic prompt for an image that represents this music taste: ${trackList}. \nThe image should be abstract and artistic, not literal. Focus on colors, moods, and emotions. \nKeep the prompt under 100 words.`,
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
      await sendFollowup(interaction, {
        content: `**🎨 ${username}'s Music Visualization**\n\n*"${imagePrompt}"*\n\n${imageUrl}`,
      });
    } catch (error: unknown) {
      let errorMessage = 'An error occurred while generating your image.';
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