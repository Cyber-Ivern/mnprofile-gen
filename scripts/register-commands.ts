import { config } from 'dotenv';
import { registerCommands } from '../src/utils/register-commands.js';
import { join } from 'path';

// Try to load from .env.local first, then fall back to .env
const envLocalResult = config({ path: join(process.cwd(), '.env.local') });
if (envLocalResult.error) {
  console.log('No .env.local file found, trying .env...');
  const envResult = config({ path: join(process.cwd(), '.env') });
  if (envResult.error) {
    console.error('Error: No environment file found. Please create either .env.local or .env with the following variables:');
    console.error('DISCORD_CLIENT_ID=your_client_id');
    console.error('DISCORD_TOKEN=your_bot_token');
    console.error('DISCORD_PUBLIC_KEY=your_public_key');
    process.exit(1);
  }
}

// Debug environment loading
console.log('Environment file loaded successfully');
console.log('Current working directory:', process.cwd());
console.log('Environment variables found:', {
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID ? 'Set' : 'Not set',
  DISCORD_TOKEN: process.env.DISCORD_TOKEN ? 'Set' : 'Not set',
  DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY ? 'Set' : 'Not set'
});

async function main() {
  try {
    await registerCommands();
    console.log('Commands registered successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
}

main(); 