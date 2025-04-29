import { NextResponse } from 'next/server';
import { userTokens } from '../spotify';

export async function handleVerify(interaction: any) {
  const userId = interaction.user.id;
  const isConnected = userTokens.has(userId);

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