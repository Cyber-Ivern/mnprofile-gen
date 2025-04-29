/**
 * Copyright (c) 2024-present xDJs LLC
 * 
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSpotifyAccessToken, getTopTracks } from '@src/utils/spotify-client';

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const refreshToken = cookieStore.get('spotify_refresh_token')?.value;
    const timeRange = cookieStore.get('spotify_timeRange')?.value || 'short_term';
    const trackLimit = cookieStore.get('spotify_trackLimit')?.value || '10';

    if (!refreshToken) {
      return NextResponse.json({ error: 'No refresh token found' }, { status: 401 });
    }

    // Get new access token
    const accessToken = await getSpotifyAccessToken(refreshToken);
    
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 });
    }

    // Get updated top tracks
    const topTracks = await getTopTracks(accessToken, timeRange, parseInt(trackLimit));

    // Create response with cookies
    const response = NextResponse.json({ tracks: topTracks });
    
    // Set cookies
    const cookieOptions = {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 3600
    };

    response.cookies.set('spotify_tracks', JSON.stringify(topTracks), cookieOptions);

    return response;
  } catch (error) {
    console.error('Error refreshing Spotify data:', error);
    return NextResponse.json({ error: 'Failed to refresh Spotify data' }, { status: 500 });
  }
} 