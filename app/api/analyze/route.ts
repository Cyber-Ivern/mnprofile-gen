/**
 * Copyright (c) 2024 mnprofile-gen
 * 
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { NextResponse } from 'next/server';
import OpenAI from 'openai';

interface Track {
  name: string;
  artist: string;
}

// Helper function to parse cookies
function parseCookies(cookieString: string): { spotify_tracks?: Track[] } {
  console.log('Parsing cookies, cookie string length:', cookieString?.length ?? 0);
  if (!cookieString) {
    console.log('No cookies provided');
    return {};
  }
  
  try {
    const cookies = cookieString.split('; ').reduce((acc: { spotify_tracks?: Track[] }, cookie) => {
      const [name, value] = cookie.split('=');
      if (name === 'spotify_tracks') {
        try {
          const decodedValue = decodeURIComponent(value);
          const parsedTracks = JSON.parse(decodedValue);
          console.log('Successfully parsed spotify_tracks cookie:', {
            tracksCount: parsedTracks.length,
            sampleTrack: parsedTracks[0]
          });
          acc.spotify_tracks = parsedTracks;
        } catch (e) {
          console.error('Error parsing spotify_tracks cookie:', e);
        }
      }
      return acc;
    }, {});
    
    console.log('Parsed cookies result:', {
      hasSpotifyTracks: !!cookies.spotify_tracks,
      tracksCount: cookies.spotify_tracks?.length
    });
    
    return cookies;
  } catch (error) {
    console.error('Error in parseCookies:', error);
    return {};
  }
}

export async function POST(request: Request) {
  console.log('Starting text analysis request');
  try {
    const { displayName } = await request.json();
    console.log('Request payload:', { displayName });

    const cookies = parseCookies(request.headers.get('cookie') || '');
    const tracks = cookies.spotify_tracks || [];
    const model = process.env.OPENAI_MODEL || "gpt-3.5-turbo";

    console.log('Analysis configuration:', {
      tracksCount: tracks.length,
      model,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY
    });

    if (!tracks.length) {
      console.warn('No tracks found in cookies');
      return NextResponse.json({ error: 'No tracks found' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key not found');
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Generate text analysis
    const textContent = `You are the apex music nerd. You are fun, engaging, and know your stuff. You are can also be teasing but in a playful and fun way. Generate a music nerd profile of ${displayName} given their top tracks:\n\n${tracks.map((track: Track, i: number) => `${i + 1}. ${track.name} by ${track.artist}`).join('\n')}`;

    console.log('Starting OpenAI text completion:', {
      model,
      promptLength: textContent.length,
      tracksCount: tracks.length,
      temperature: 0.7
    });

    const textCompletion = await openai.chat.completions.create({
      messages: [{ role: "user", content: textContent }],
      model: model,
      temperature: 0.7,
    });

    const analysis = textCompletion.choices[0].message.content;
    console.log('OpenAI text completion successful:', {
      completionId: textCompletion.id,
      model: textCompletion.model,
      responseLength: analysis?.length ?? 0,
      promptTokens: textCompletion.usage?.prompt_tokens,
      completionTokens: textCompletion.usage?.completion_tokens,
      totalTokens: textCompletion.usage?.total_tokens
    });

    return NextResponse.json({ analysis, model });
  } catch (error) {
    console.error('Error in analyze route:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    interface ErrorResponse {
      response?: {
        data: {
          message: string;
          [key: string]: unknown;
        };
      };
    }
    
    const typedError = error as Error & ErrorResponse;
    const errorDetails = typedError instanceof Error && typedError.response?.data
      ? typedError.response.data 
      : { message: errorMessage };
    
    // Enhanced OpenAI error logging
    console.error('Error details:', {
      message: errorMessage,
      details: errorDetails,
      stack: error instanceof Error ? error.stack : undefined,
      isOpenAIError: error instanceof OpenAI.APIError,
      openAIDetails: error instanceof OpenAI.APIError ? {
        status: error.status,
        headers: error.headers,
        code: error.code,
        type: error.type
      } : undefined
    });
    
    return NextResponse.json({ 
      error: 'Failed to analyze tracks',
      details: errorDetails
    }, { status: 500 });
  }
} 