import type { NextApiRequest, NextApiResponse } from 'next';
// Debug logging
console.log('Discord API route invoked');

import { verifyKey } from 'discord-interactions';
import SpotifyWebApi from 'spotify-web-api-node';
import OpenAI from 'openai';

// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID!,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
  redirectUri: process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/api/auth/callback`
    : 'http://127.0.0.1:3000/api/auth/callback'
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// In-memory user token store (not persistent on Vercel, for demo only)
const userTokens = new Map<string, string>();
const userTracksCache = new Map<string, { tracks: any[], timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper to send a DM via Discord API
async function sendDMToUser(userId: string, message: string) {
  const discordToken = process.env.DISCORD_TOKEN;
  if (!discordToken) throw new Error('DISCORD_TOKEN is not set');
  // Create DM channel
  const dmChannelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${discordToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ recipient_id: userId })
  });
  if (!dmChannelRes.ok) throw new Error(`Failed to create DM channel: ${await dmChannelRes.text()}`);
  const dmChannel = await dmChannelRes.json();
  // Send message
  const sendMsgRes = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${discordToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content: message })
  });
  if (!sendMsgRes.ok) throw new Error(`Failed to send DM: ${await sendMsgRes.text()}`);
}

// Command handlers (same as before)
async function handleConnect(interaction: any) { /* ...existing code... */ }
async function handleProfile(interaction: any) { /* ...existing code... */ }
async function handleTracks(interaction: any) { /* ...existing code... */ }
async function handleVerify(interaction: any) { /* ...existing code... */ }
async function handleImage(interaction: any) { /* ...existing code... */ }

// Main handler for Discord interactions
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('Received request:', {
    method: req.method,
    headers: req.headers,
    body: req.body
  });

  // Handle Discord's verification request first
  if (req.body?.type === 1) {
    console.log('Responding to PING request');
    return res.status(200).json({ type: 1 });
  }

  // Then verify the request is from Discord
  const signature = String(req.headers['x-signature-ed25519'] || '');
  const timestamp = String(req.headers['x-signature-timestamp'] || '');
  const body = JSON.stringify(req.body);
  
  console.log('Verification details:', {
    hasSignature: !!signature,
    hasTimestamp: !!timestamp,
    hasPublicKey: !!process.env.DISCORD_PUBLIC_KEY,
    bodyType: req.body?.type
  });

  const isValidRequest = verifyKey(body, signature, timestamp, process.env.DISCORD_PUBLIC_KEY!);

  if (!isValidRequest) {
    console.log('Invalid request signature');
    return res.status(401).json({ error: 'Invalid request signature' });
  }

  // Handle commands
  const { type, data } = req.body;
  if (type === 2) { // Application Command
    const command = data.name;
    let response;

    switch (command) {
      case 'connect':
        response = await handleConnect(req.body);
        break;
      case 'profile':
        response = await handleProfile(req.body);
        break;
      case 'tracks':
        response = await handleTracks(req.body);
        break;
      case 'verify':
        response = await handleVerify(req.body);
        break;
      case 'image':
        response = await handleImage(req.body);
        break;
      default:
        response = {
          content: 'Unknown command',
          flags: 64
        };
    }

    return res.status(200).json({
      type: 4,
      data: response
    });
  }

  // Handle other interaction types if needed
  return res.status(400).json({ error: 'Unsupported interaction type' });
} 