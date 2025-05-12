/**
 * Copyright (c) 2024-present xDJs LLC
 * 
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { NextRequest, NextResponse } from 'next/server';
import { spotifyApi, setWebToken, setBotToken } from '../../spotify';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/error?message=' + encodeURIComponent(error), req.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/error?message=Missing code or state', req.url));
  }

  try {
    // Exchange code for token using the correct method
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(
          process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
        ).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI!
      })
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange token');
    }

    const data = await tokenResponse.json();
    const accessToken = data.access_token;

    if (!accessToken) {
      throw new Error('Failed to get access token');
    }

    // Check if this is a bot user (state will be the Discord user ID)
    if (/^\d+$/.test(state)) {
      // This is a bot user
      await setBotToken(state, accessToken);
      return new NextResponse('Successfully connected! You can close this window and return to Discord.', {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    } else {
      // This is a web user
      await setWebToken(accessToken);
      return NextResponse.redirect(new URL('/profile', req.url));
    }
  } catch (error) {
    console.error('Error during token exchange:', error);
    return NextResponse.redirect(new URL('/error?message=Failed to exchange token', req.url));
  }
} 