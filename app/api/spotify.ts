import SpotifyWebApi from 'spotify-web-api-node';
import { getWebToken, setWebToken, deleteWebToken, getBotToken, setBotToken, deleteBotToken, getCachedTracks, setCachedTracks } from './token-store';

// Validate environment variables
const requiredEnvVars = {
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI,
};

// Check if any required environment variables are missing
const missingEnvVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// Initialize Spotify API
export const spotifyApi = new SpotifyWebApi({
  clientId: requiredEnvVars.SPOTIFY_CLIENT_ID!,
  clientSecret: requiredEnvVars.SPOTIFY_CLIENT_SECRET!,
  redirectUri: requiredEnvVars.SPOTIFY_REDIRECT_URI!,
});

// Export token management functions
export {
  // Web app token management
  getWebToken,
  setWebToken,
  deleteWebToken,
  // Bot token management
  getBotToken,
  setBotToken,
  deleteBotToken,
  // Track cache management
  getCachedTracks,
  setCachedTracks,
}; 