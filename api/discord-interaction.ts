import { verifyKey } from 'discord-interactions';
import { NextApiRequest, NextApiResponse } from 'next';
import { handleConnect } from './commands/connect';
import { handleProfile } from './commands/profile';
import { handleTracks } from './commands/tracks';
import { handleVerify } from './commands/verify';
import { handleImage } from './commands/image';

// Verify Discord interaction
function verifyDiscordRequest(clientKey: string, body: any, signature: string, timestamp: string) {
  return verifyKey(body, signature, timestamp, clientKey);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];

  if (!signature || !timestamp || typeof signature !== 'string' || typeof timestamp !== 'string') {
    return res.status(401).json({ error: 'Invalid request signature' });
  }

  // Verify the request
  const isValidRequest = verifyDiscordRequest(
    process.env.DISCORD_PUBLIC_KEY!,
    req.body,
    signature,
    timestamp
  );

  if (!isValidRequest) {
    return res.status(401).json({ error: 'Invalid request signature' });
  }

  const interaction = req.body;

  // Handle Discord ping
  if (interaction.type === 1) {
    return res.status(200).json({ type: 1 });
  }

  // Handle commands
  if (interaction.type === 2) {
    const { commandName } = interaction.data;

    try {
      switch (commandName) {
        case 'connect':
          return await handleConnect(interaction, res);
        case 'profile':
          return await handleProfile(interaction, res);
        case 'tracks':
          return await handleTracks(interaction, res);
        case 'verify':
          return await handleVerify(interaction, res);
        case 'image':
          return await handleImage(interaction, res);
        default:
          return res.status(400).json({ error: 'Unknown command' });
      }
    } catch (error) {
      console.error('Error handling command:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(400).json({ error: 'Unknown interaction type' });
} 