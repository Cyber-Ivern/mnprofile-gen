import OpenAI from 'openai';

// Initialize OpenAI
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}); 