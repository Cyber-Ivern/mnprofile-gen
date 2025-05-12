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
    // Exchange code for token
    const data = await spotifyApi.authorizationCodeGrant(code);
    const accessToken = data.body.access_token;

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