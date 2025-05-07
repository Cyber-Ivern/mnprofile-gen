import { NextResponse } from 'next/server';

export async function handleConnect(interaction: any) {
  console.log('handleConnect called with interaction:', JSON.stringify(interaction, null, 2));
  // Safely extract user info
  const user = interaction.user ?? interaction.member?.user;
  const userId = user?.id;

  // Build the Spotify auth URL using the same logic as the web app
  const scopes = [
    'user-top-read',
    'user-read-private',
    'user-read-email'
  ];
  const state = userId;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: scopes.join(' '),
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    state,
    show_dialog: 'true'
  });
  const authorizeURL = `https://accounts.spotify.com/authorize?${params.toString()}`;

  try {
    // 1. Create DM channel
    const dmChannelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_id: userId }),
    });

    if (!dmChannelRes.ok) {
      // Fallback: tell the user to enable DMs
      return NextResponse.json({
        type: 4,
        data: {
          content: 'I could not DM you. Please make sure your DMs are open!',
          flags: 64,
        },
      });
    }

    const dmChannel = await dmChannelRes.json();

    // 2. Send the DM
    await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: `Click this link to connect your Spotify account: ${authorizeURL}` }),
    });

    // 3. Respond to the interaction
    return NextResponse.json({
      type: 4,
      data: {
        content: 'Check your DMs for the Spotify connection link!',
        flags: 64,
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