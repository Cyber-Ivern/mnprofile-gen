import { NextResponse } from 'next/server';
import { profileQueue } from '../../../queue/profileQueue'; // Or create imageQueue if you want a separate queue

export async function handleImage(interaction: any) {
  // Gather necessary data for the worker
  const user = interaction.user ?? interaction.member?.user;
  const userId = user?.id;
  const username = user?.username;
  const interactionToken = interaction.token;
  const applicationId = interaction.application_id;
  const channelId = interaction.channel_id;
  // Add any other data you need for the worker

  // Enqueue the job for the worker
  await profileQueue.add('generateImage', {
    userId,
    username,
    interactionToken,
    applicationId,
    channelId,
    // ...any other data needed for the worker
  });

  // Respond immediately to Discord to avoid timeout
  return NextResponse.json({ type: 5 });
} 