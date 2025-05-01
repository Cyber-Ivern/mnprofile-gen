import { NextResponse } from 'next/server';
import { spotifyApi, userTokens } from '../spotify';
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
  const userId = interaction.user.id;
  const accessToken = userTokens.get(userId);

  if (!accessToken) {
    return NextResponse.json({
      type: 4,
      data: {
        content: 'Please connect your Spotify account first using /connect',
        flags: 64, // ephemeral
      },
    });
  }

  spotifyApi.setAccessToken(accessToken);

  try {
    // Fetch top tracks
    const topTracks = await spotifyApi.getMyTopTracks({ limit: 10 });
    
    // Format tracks for display
    const trackList = topTracks.body.items
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

    return NextResponse.json({
      type: 4,
      data: {
        content: `**🎵 ${interaction.user.username}'s Music Nerd Profile**\n\n${profile}\n\n**🎧 Top Tracks**\n${trackList}`,
      },
    });
  } catch (error: unknown) {
    console.error('Profile generation error:', error);
    
    let errorMessage = 'An error occurred while generating your profile.';
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const spotifyError = error as SpotifyError;
      if (spotifyError.statusCode === 401) {
        errorMessage = 'Your Spotify session has expired. Please reconnect using /connect';
      } else if (spotifyError.statusCode === 429) {
        errorMessage = 'Rate limit exceeded. Please try again in a few minutes.';
      }
    }

    return NextResponse.json({
      type: 4,
      data: {
        content: errorMessage,
        flags: 64, // ephemeral
      },
    });
  }
} 