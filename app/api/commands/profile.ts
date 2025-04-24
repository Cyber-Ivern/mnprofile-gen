import { NextResponse } from 'next/server';
import { EmbedBuilder } from 'discord.js';
import SpotifyWebApi from 'spotify-web-api-node';
import OpenAI from 'openai';
import { getUserToken } from '../../../lib/storage';

// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handleProfile(interaction: any) {
  const userId = interaction.member.user.id;
  const accessToken = await getUserToken(userId);

  if (!accessToken) {
    return NextResponse.json({
      type: 4,
      data: {
        content: 'Please connect your Spotify account first using /connect',
        flags: 64, // Ephemeral flag
      },
    });
  }

  // Defer the response
  await NextResponse.json({
    type: 5, // Deferred response
  });

  spotifyApi.setAccessToken(accessToken);

  try {
    // Fetch top tracks
    const topTracks = await spotifyApi.getMyTopTracks({ limit: 10 });
    
    // Format tracks for display
    const trackList = topTracks.body.items
      .map((track: any, index: number) => {
        const artists = track.artists.map((artist: any) => artist.name).join(', ');
        return `${index + 1}. **${track.name}** - ${artists}`;
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

    // Create rich embed
    const embed = new EmbedBuilder()
      .setTitle(`🎵 ${interaction.member.user.username}'s Music Nerd Profile`)
      .setDescription(profile)
      .addFields(
        { name: '🎧 Top Tracks', value: trackList }
      )
      .setColor('#1DB954')
      .setFooter({ text: 'Generated with Spotify & OpenAI' })
      .setTimestamp();

    // Send the follow-up message
    return NextResponse.json({
      type: 4,
      data: {
        embeds: [embed.toJSON()],
      },
    });
  } catch (error: any) {
    console.error('Profile generation error:', error);
    
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
        flags: 64, // Ephemeral flag
      },
    });
  }
} 