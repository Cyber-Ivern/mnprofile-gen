/**
 * Copyright (c) 2024-present xDJs LLC
 * 
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  SPOTIFY_AUTH_URL,
  SPOTIFY_TOKEN_URL,
  SPOTIFY_API_URL,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_SCOPES,
  Track
} from './spotify';

// Store user tokens in memory (for development)
const userTokens = new Map<string, string>();

export { userTokens };

// Spotify API client
export const spotifyApi = {
  getAuthUrl: (timeRange: string, trackLimit: string) => {
    const state = JSON.stringify({ timeRange, trackLimit });
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: SPOTIFY_CLIENT_ID!,
      scope: SPOTIFY_SCOPES.join(' '),
      redirect_uri: SPOTIFY_REDIRECT_URI!,
      state,
      show_dialog: 'true'
    });

    return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
  },

  getAccessToken: async (code: string) => {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI!,
    });

    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
        ).toString('base64')}`,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error('Failed to get access token');
    }

    return response.json();
  },

  getUserProfile: async (accessToken: string) => {
    const response = await fetch(`${SPOTIFY_API_URL}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user profile');
    }

    return response.json();
  },

  getTopTracks: async (accessToken: string, timeRange: string, limit: number): Promise<Track[]> => {
    const response = await fetch(
      `${SPOTIFY_API_URL}/me/top/tracks?time_range=${timeRange}&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to get top tracks');
    }

    const data = await response.json();
    return data.items.map((track: any) => ({
      name: track.name,
      artist: track.artists[0].name,
    }));
  }
}; 