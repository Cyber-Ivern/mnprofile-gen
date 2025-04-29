import SpotifyWebApi from 'spotify-web-api-node';

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

// Store user tokens temporarily (in production, use a proper database)
export const userTokens = new Map<string, string>(); 