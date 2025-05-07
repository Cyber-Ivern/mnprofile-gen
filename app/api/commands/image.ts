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

export async function handleImage(interaction: any) {
  console.log('handleImage called with interaction:', JSON.stringify(interaction, null, 2));
  // Safely extract user info
  const user = interaction.user ?? interaction.member?.user;
  const userId = user?.id;
  const username = user?.username;
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
    const topTracks = await spotifyApi.getMyTopTracks({ limit: 5 });
    const trackList = topTracks.body.items
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
          content: `Create a detailed, artistic prompt for an image that represents this music taste: ${trackList}. 
          The image should be abstract and artistic, not literal. Focus on colors, moods, and emotions. 
          Keep the prompt under 100 words.`,
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

    return NextResponse.json({
      type: 4,
      data: {
        content: `**🎨 ${username}'s Music Visualization**\n\n*"${imagePrompt}"*\n\n${imageUrl}`,
      },
    });
  } catch (error: unknown) {
    console.error('Image generation error:', error);
    
    let errorMessage = 'An error occurred while generating your image.';
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