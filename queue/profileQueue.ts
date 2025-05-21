import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.UPSTASH_REDIS_URL!, {
  password: process.env.UPSTASH_REDIS_PASSWORD,
  tls: {}, // Upstash requires TLS
  maxRetriesPerRequest: null, // Required for BullMQ
});

export const profileQueue = new Queue('profile', { connection }); 