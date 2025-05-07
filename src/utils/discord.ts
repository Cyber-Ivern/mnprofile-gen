import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables
const envLocalResult = config({ path: join(process.cwd(), '.env.local') });
if (envLocalResult.error) {
  console.log('No .env.local file found, trying .env...');
  const envResult = config({ path: join(process.cwd(), '.env') });
  if (envResult.error) {
    console.error('Error: No environment file found');
  }
}

// Discord API credentials
export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
export const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
export const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

// Debug environment variables
console.log('Discord Environment Variables:', {
  hasClientId: !!DISCORD_CLIENT_ID,
  hasToken: !!DISCORD_TOKEN,
  hasPublicKey: !!DISCORD_PUBLIC_KEY,
  clientId: DISCORD_CLIENT_ID,
  tokenPreview: DISCORD_TOKEN ? `${DISCORD_TOKEN.substring(0, 10)}...` : null,
  publicKeyPreview: DISCORD_PUBLIC_KEY ? `${DISCORD_PUBLIC_KEY.substring(0, 10)}...` : null
});

// Validate environment variables
if (!DISCORD_CLIENT_ID || !DISCORD_TOKEN || !DISCORD_PUBLIC_KEY) {
  console.error('Missing Discord environment variables. Please check your .env file contains:');
  console.error('DISCORD_CLIENT_ID=your_client_id');
  console.error('DISCORD_TOKEN=your_bot_token');
  console.error('DISCORD_PUBLIC_KEY=your_public_key');
  throw new Error('Missing required Discord environment variables');
} 