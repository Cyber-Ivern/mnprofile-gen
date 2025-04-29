import SpotifyWebApi from 'spotify-web-api-node';

// Initialize Spotify API
export const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

// Store user tokens temporarily (in production, use a proper database)
export const userTokens = new Map<string, string>(); 