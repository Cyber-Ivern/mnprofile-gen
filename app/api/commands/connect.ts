import { NextResponse } from 'next/server';
import { spotifyApi } from '../spotify';

export async function handleConnect(interaction: any) {
  const scopes = [
    'user-top-read',
    'user-read-private',
    'user-read-email'
  ];
  
  // Generate a unique state parameter for security
  const state = interaction.user.id;
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