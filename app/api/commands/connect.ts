import { NextResponse } from 'next/server';

export async function handleConnect(interaction: any) {
  console.log('handleConnect called with interaction:', JSON.stringify(interaction, null, 2));
  // Safely extract user info
  const user = interaction.user ?? interaction.member?.user;
  const userId = user?.id;

  // Link to the web app's connect page
  const webAppConnectUrl = 'https://mnprofile-gen-1h4x.vercel.app/connect';

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
      body: JSON.stringify({ content: `Click this link to connect your Spotify account: ${webAppConnectUrl}` }),
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