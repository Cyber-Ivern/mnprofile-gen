/**
 * Copyright (c) 2024-present xDJs LLC
 * 
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { NextResponse } from 'next/server';
import { getAccessToken, getUserProfile, getTopTracks } from '@/utils/spotify';
import { userTokens } from '@/utils/spotify-client';

// Constants for validation
const VALID_TIME_RANGES = ['short_term', 'medium_term', 'long_term'] as const;
const DEFAULT_TIME_RANGE = 'short_term';
const DEFAULT_TRACK_LIMIT = '10';

interface StateData {
  userId: string;
  timeRange: string;
  trackLimit: string;
  timestamp: number;
}

export async function GET(request: Request) {
  console.log('Starting auth callback request');
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');

  console.log('Auth callback params:', {
    hasCode: !!code,
    codePreview: code ? `${code.substring(0, 10)}...` : null,
    hasState: !!stateParam
  });

  // Default values
  let timeRange = 'short_term';
  let trackLimit = '10';
  let userId: string | null = null;

  // Parse and validate state
  if (stateParam) {
    try {
      // Decode base64 state
      const decodedState = Buffer.from(stateParam, 'base64').toString();
      const state = JSON.parse(decodedState) as StateData;
      
      // Validate state data
      if (!state.userId || typeof state.userId !== 'string') {
        throw new Error('Invalid state: missing or invalid userId');
      }
      
      // Validate time range
      if (state.timeRange && VALID_TIME_RANGES.includes(state.timeRange as any)) {
        timeRange = state.timeRange;
      } else {
        console.warn(`Invalid time range in state: ${state.timeRange}, using default: ${DEFAULT_TIME_RANGE}`);
      }
      
      // Validate track limit
      const parsedLimit = parseInt(state.trackLimit);
      if (state.trackLimit && !isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 50) {
        trackLimit = state.trackLimit;
      } else {
        console.warn(`Invalid track limit in state: ${state.trackLimit}, using default: ${DEFAULT_TRACK_LIMIT}`);
      }
      
      // Validate timestamp (optional: check if state is not too old)
      const stateAge = Date.now() - state.timestamp;
      if (stateAge > 3600000) { // 1 hour
        console.warn('State is older than 1 hour, but proceeding anyway');
      }
      
      userId = state.userId;
      console.log('Successfully parsed and validated state:', { 
        userId,
        timeRange,
        trackLimit,
        stateAge: `${Math.round(stateAge / 1000)}s`
      });
    } catch (e) {
      console.error('Error parsing state parameter:', e);
      // If we can't parse the state, we'll use defaults but log the error
    }
  }

  if (!code) {
    console.error('No code received in callback');
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url));
  }

  if (!userId) {
    console.error('No userId found in state');
    return NextResponse.redirect(new URL('/?error=invalid_state', request.url));
  }

  try {
    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
      console.error('Missing Spotify credentials:', {
        hasClientId: !!process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID,
        hasClientSecret: !!process.env.SPOTIFY_CLIENT_SECRET
      });
      throw new Error('Missing Spotify credentials');
    }

    console.log('Getting access token...');
    const { access_token, refresh_token } = await getAccessToken(code);
    
    if (!access_token) {
      console.error('No access token received');
      throw new Error('Failed to get access token');
    }

    if (!refresh_token) {
      console.error('No refresh token received');
      throw new Error('Failed to get refresh token');
    }

    console.log('Successfully received tokens:', {
      hasAccessToken: !!access_token,
      accessTokenPreview: `${access_token.substring(0, 10)}...`,
      hasRefreshToken: !!refresh_token,
      refreshTokenPreview: `${refresh_token.substring(0, 10)}...`
    });

    console.log('Getting user profile...');
    try {
      const profile = await getUserProfile(access_token);
      console.log('Got user profile:', {
        displayName: profile.display_name,
        id: profile.id
      });

      console.log('Getting top tracks...');
      const topTracks = await getTopTracks(access_token, timeRange, trackLimit);
      console.log('Got top tracks:', {
        count: topTracks.length,
        timeRange,
        trackLimit
      });

      // Create response with cookies and client-side redirect
      const response = new NextResponse(`
        <html>
          <body>
            <script>
              window.location.href = '/';
            </script>
            <p>Connecting...</p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
      
      // Set cookies
      const cookieOptions = {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
        maxAge: 3600
      };

      response.cookies.set('spotify_name', profile.display_name, cookieOptions);
      response.cookies.set('spotify_tracks', JSON.stringify(topTracks), cookieOptions);
      response.cookies.set('spotify_refresh_token', refresh_token, {
        ...cookieOptions,
        httpOnly: true
      });
      response.cookies.set('spotify_timeRange', timeRange, cookieOptions);
      response.cookies.set('spotify_trackLimit', trackLimit, cookieOptions);

      // When storing tokens, include the validated timeRange
      userTokens.set(userId, access_token);
      console.log(`[Callback] Stored access token for userId: ${userId} with timeRange: ${timeRange}`);

      console.log('Auth callback completed successfully');
      return response;
    } catch (profileError) {
      console.error('Error in profile/tracks flow:', profileError);
      // Handle specific error for unregistered users
      if (profileError instanceof Error && profileError.message.includes('needs to be registered')) {
        console.warn('User needs to be registered in Spotify Dashboard');
        const response = NextResponse.redirect(new URL('/?error=unregistered_user', request.url));
        response.cookies.delete('spotify_name');
        response.cookies.delete('spotify_tracks');
        return response;
      }
      throw profileError;
    }
  } catch (error) {
    console.error('Error during Spotify authentication:', error);
    const response = NextResponse.redirect(new URL('/?error=auth_failed', request.url));
    response.cookies.delete('spotify_name');
    response.cookies.delete('spotify_tracks');
    return response;
  }
} 