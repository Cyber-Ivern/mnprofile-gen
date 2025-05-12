import { NextResponse } from 'next/server';
import { hasBotToken } from '../spotify';

export async function handleVerify(interaction: any) {
  console.log('handleVerify called with interaction:', JSON.stringify(interaction, null, 2));
  // Safely extract user info
  const user = interaction.user ?? interaction.member?.user;
  const userId = user?.id;
  const isConnected = await hasBotToken(userId);

  if (isConnected) {
    return NextResponse.json({
      type: 4,
      data: {
        content: '✅ Your Spotify account is connected!',
        flags: 64, // ephemeral
      },
    });
  } else {
    return NextResponse.json({
      type: 4,
      data: {
        content: '❌ Your Spotify account is not connected. Use /connect to link it.',
        flags: 64, // ephemeral
      },
    });
  }
} 