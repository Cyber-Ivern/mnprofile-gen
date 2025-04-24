import { verifyKey } from 'discord-interactions';
import { NextRequest, NextResponse } from 'next/server';
import { handleConnect } from '../commands/connect';
import { handleProfile } from '../commands/profile';
import { handleTracks } from '../commands/tracks';
import { handleVerify } from '../commands/verify';
import { handleImage } from '../commands/image';

// Verify Discord interaction
function verifyDiscordRequest(clientKey: string, body: any, signature: string, timestamp: string) {
  return verifyKey(body, signature, timestamp, clientKey);
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-signature-ed25519');
  const timestamp = req.headers.get('x-signature-timestamp');

  if (!signature || !timestamp) {
    return NextResponse.json({ error: 'Invalid request signature' }, { status: 401 });
  }

  const body = await req.json();

  // Verify the request
  const isValidRequest = verifyDiscordRequest(
    process.env.DISCORD_PUBLIC_KEY!,
    body,
    signature,
    timestamp
  );

  if (!isValidRequest) {
    return NextResponse.json({ error: 'Invalid request signature' }, { status: 401 });
  }

  const interaction = body;

  // Handle Discord ping
  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // Handle commands
  if (interaction.type === 2) {
    const { commandName } = interaction.data;

    try {
      switch (commandName) {
        case 'connect':
          return await handleConnect(interaction);
        case 'profile':
          return await handleProfile(interaction);
        case 'tracks':
          return await handleTracks(interaction);
        case 'verify':
          return await handleVerify(interaction);
        case 'image':
          return await handleImage(interaction);
        default:
          return NextResponse.json({ error: 'Unknown command' }, { status: 400 });
      }
    } catch (error) {
      console.error('Error handling command:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown interaction type' }, { status: 400 });
} 