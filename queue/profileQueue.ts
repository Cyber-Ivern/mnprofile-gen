import { Queue } from 'bullmq';
import IORedis from 'ioredis';

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_PASSWORD) {
  throw new Error('Missing Upstash Redis environment variables');
}

const connection = new IORedis(process.env.UPSTASH_REDIS_REST_URL, {
  password: process.env.UPSTASH_REDIS_PASSWORD,
  tls: {}, // Upstash requires TLS
  maxRetriesPerRequest: null, // Required for BullMQ
});

// Create separate queues for profile and image generation
export const profileQueue = new Queue('profile-generation', { connection });
export const imageQueue = new Queue('image-generation', { connection });

// Helper function to add jobs with proper typing
export interface ProfileJobData {
  userId: string;
  username: string;
  interactionToken: string;
  applicationId: string;
  channelId: string;
  accessToken: string;
}

export interface ImageJobData extends ProfileJobData {
  // Add any image-specific data here
}

export async function enqueueProfileJob(data: ProfileJobData) {
  return profileQueue.add('generate-profile', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  });
}

export async function enqueueImageJob(data: ImageJobData) {
  return imageQueue.add('generate-image', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  });
} 