import { NextResponse } from 'next/server';
import { spotifyApi, userTokens } from '../spotify';

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

export async function handleTracks(interaction: any) {
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
    const topTracks = await spotifyApi.getMyTopTracks({ limit: 10 });
    
    const trackList = topTracks.body.items
      .map((track: SpotifyTrack) => `${track.name} - ${track.artists[0].name}`)
      .join('\n');

    return NextResponse.json({
      type: 4,
      data: {
        content: `**${interaction.user.username}'s Top Tracks**\n\n${trackList}`,
      },
    });
  } catch (error: unknown) {
    console.error(error);
    let errorMessage = 'An error occurred while fetching your top tracks.';
    
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