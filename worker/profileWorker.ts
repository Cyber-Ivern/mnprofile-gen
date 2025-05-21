import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import fetch from 'node-fetch';

const connection = new IORedis(process.env.UPSTASH_REDIS_URL!, {
  password: process.env.UPSTASH_REDIS_PASSWORD,
  tls: {},
  maxRetriesPerRequest: null,
});

async function sendDiscordFollowup({ applicationId, interactionToken, content }: { applicationId: string, interactionToken: string, content: string }) {
  const webhookUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

const worker = new Worker('profile', async job => {
  const { userId, username, interactionToken, applicationId, channelId } = job.data;
  if (job.name === 'generateProfile') {
    // TODO: Fetch Spotify data, generate profile with OpenAI, etc.
    // For now, mock the result
    const profile = `**🎵 ${username}'s Music Nerd Profile**\n\nThis is a mock profile. Replace with real OpenAI logic.\n\n**🎧 Top Tracks**\nTrack 1 - Artist 1\nTrack 2 - Artist 2`;
    await sendDiscordFollowup({ applicationId, interactionToken, content: profile });
  } else if (job.name === 'generateImage') {
    // TODO: Fetch Spotify data, generate image prompt and image, etc.
    // For now, mock the result
    const imagePrompt = 'This is a mock image prompt.';
    const imageUrl = 'https://via.placeholder.com/512';
    const content = `**🎨 ${username}'s Music Visualization**\n\n*\"${imagePrompt}\"*\n\n${imageUrl}`;
    await sendDiscordFollowup({ applicationId, interactionToken, content });
  } else {
    await sendDiscordFollowup({ applicationId, interactionToken, content: 'Unknown job type.' });
  }
}, { connection });

worker.on('completed', job => {
  console.log(`Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
}); 