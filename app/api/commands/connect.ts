import { NextResponse } from 'next/server';
import { spotifyApi } from '../spotify';

export async function handleConnect(interaction: any) {
  console.log('handleConnect called with interaction:', JSON.stringify(interaction, null, 2));
  const scopes = [
    'user-top-read',
    'user-read-private',
    'user-read-email'
  ];
  
  // Safely extract user info
  const user = interaction.user ?? interaction.member?.user;
  const userId = user?.id;

  // Generate a unique state parameter for security
  const state = userId;
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes, state);
  
  try {
    return NextResponse.json({
      type: 4,
      data: {
        content: `Click this link to connect your Spotify account: ${authorizeURL}`,
        flags: 64, // ephemeral
      },
    });
  } catch (error) {
    console.error('Connect error:', error);
    return NextResponse.json({
      type: 4,
      data: {
        content: 'An error occurred while generating the connection link.',
        flags: 64, // ephemeral
      },
    });
  }
} 