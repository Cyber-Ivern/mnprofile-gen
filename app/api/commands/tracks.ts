import { EmbedBuilder } from 'discord.js';
import { NextResponse } from 'next/server';
import { spotifyApi } from '../spotify';

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
    
    const embed = new EmbedBuilder()
      .setTitle(`${interaction.user.username}'s Top Tracks`)
      .setDescription(
        topTracks.body.items
          .map((track, index) => `${index + 1}. ${track.name} - ${track.artists[0].name}`)
          .join('\n')
      )
      .setColor('#1DB954')
      .setTimestamp();

    return NextResponse.json({
      type: 4,
      data: {
        embeds: [embed.toJSON()],
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({
      type: 4,
      data: {
        content: 'An error occurred while fetching your top tracks.',
        flags: 64, // ephemeral
      },
    });
  }
} 