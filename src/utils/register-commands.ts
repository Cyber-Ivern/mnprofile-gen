import { DISCORD_CLIENT_ID, DISCORD_TOKEN } from './discord.js';

const DISCORD_API_URL = 'https://discord.com/api/v10';

interface Command {
  name: string;
  description: string;
  options?: Array<{
    name: string;
    description: string;
    type: number;
    required?: boolean;
  }>;
}

const commands: Command[] = [
  {
    name: 'connect',
    description: 'Connect your Spotify account to generate your music nerd profile',
  },
  {
    name: 'profile',
    description: 'View your generated music nerd profile',
  },
  {
    name: 'tracks',
    description: 'View your top tracks from Spotify',
  },
  {
    name: 'verify',
    description: 'Verify your Spotify connection',
  },
  {
    name: 'image',
    description: 'Generate a profile image based on your music taste',
  }
];

export async function registerCommands() {
  if (!DISCORD_CLIENT_ID || !DISCORD_TOKEN) {
    throw new Error('Missing Discord credentials');
  }

  try {
    console.log('Registering Discord commands...');
    
    const response = await fetch(
      `${DISCORD_API_URL}/applications/${DISCORD_CLIENT_ID}/commands`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bot ${DISCORD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to register commands: ${error}`);
    }

    const data = await response.json();
    console.log('Successfully registered commands:', data);
    return data;
  } catch (error) {
    console.error('Error registering commands:', error);
    throw error;
  }
} 