/**
 * Copyright (c) 2024-present xDJs LLC
 * 
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { spotifyApi } from '@/utils/spotify-client';
import toast, { Toaster } from 'react-hot-toast';
import Image from 'next/image';

interface Track {
  name: string;
  artist: string;
}

interface ParsedCookies {
  spotify_name?: string;
  spotify_tracks?: Track[];
  spotify_timeRange?: string;
  spotify_trackLimit?: string;
}

// Helper function to parse cookies
function parseCookies(): ParsedCookies {
  console.log('Raw document.cookie:', document.cookie);
  
  const cookies = document.cookie.split('; ').reduce((acc: ParsedCookies, cookie) => {
    if (!cookie) return acc;
    
    const parts = cookie.split('=');
    if (parts.length !== 2) return acc;
    
    const [name, value] = parts;
    if (!name || !value) return acc;
    
    console.log('Processing cookie:', { 
      name, 
      valuePreview: value ? value.substring(0, 50) + '...' : 'undefined'
    });
    
    try {
      // First decode the URI component
      const decodedValue = decodeURIComponent(value);
      console.log('Decoded value length:', decodedValue.length);
      
      // For spotify_tracks, attempt to parse as JSON
      if (name === 'spotify_tracks') {
        const parsedTracks = JSON.parse(decodedValue) as Track[];
        console.log('Parsed tracks count:', parsedTracks.length);
        acc.spotify_tracks = parsedTracks;
      } else if (name === 'spotify_name') {
        acc.spotify_name = decodedValue;
      } else if (name === 'spotify_timeRange') {
        acc.spotify_timeRange = decodedValue;
      } else if (name === 'spotify_trackLimit') {
        acc.spotify_trackLimit = decodedValue;
      }
    } catch (e) {
      console.error(`Error parsing cookie ${name}:`, e);
      console.error('Full cookie value:', value);
    }
    return acc;
  }, { 
    spotify_name: undefined, 
    spotify_tracks: undefined,
    spotify_timeRange: undefined,
    spotify_trackLimit: undefined
  });
  
  console.log('Final parsed cookies:', {
    hasName: !!cookies.spotify_name,
    tracksCount: cookies.spotify_tracks?.length,
    timeRange: cookies.spotify_timeRange,
    trackLimit: cookies.spotify_trackLimit
  });
  
  return cookies;
}

export default function Home() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('short_term');
  const [trackLimit, setTrackLimit] = useState('10');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Use ref to track current displayName value
  const displayNameRef = useRef(displayName);

  // Update ref when displayName changes
  useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);

  useEffect(() => {
    // Check for error in URL parameters
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    if (errorParam) {
      if (errorParam === 'unregistered_user') {
        toast.error('Please register your Spotify account at https://www.spotify.com/signup before connecting.');
      } else if (errorParam === 'auth_failed') {
        toast.error('Failed to connect with Spotify. Please try again.');
      }
      // Clear the error from URL
      window.history.replaceState({}, '', '/');
    }

    // Function to check user data
    const checkData = () => {
      console.log('Running checkData...');
      const cookies = parseCookies();
      
      if (cookies.spotify_name && cookies.spotify_name !== displayNameRef.current) {
        console.log('Updating display name:', cookies.spotify_name);
        setDisplayName(cookies.spotify_name);
      }

      if (cookies.spotify_timeRange) {
        console.log('Updating time range:', cookies.spotify_timeRange);
        setTimeRange(cookies.spotify_timeRange);
      }

      if (cookies.spotify_trackLimit) {
        console.log('Updating track limit:', cookies.spotify_trackLimit);
        setTrackLimit(cookies.spotify_trackLimit);
      }
      
      if (cookies.spotify_tracks) {
        console.log('Found tracks in cookies:', {
          newTracksLength: cookies.spotify_tracks.length,
          sample: cookies.spotify_tracks[0]
        });
        
        // Update tracks if they exist in cookies
        if (cookies.spotify_tracks.length > 0) {
          console.log('Setting tracks from cookies');
          setTracks(cookies.spotify_tracks);
        }
      } else {
        console.log('No tracks in cookies');
        setTracks([]);
      }
    };

    // Initial check
    checkData();
  }, []); // Empty dependency array - only run once on mount

  const handleConnect = () => {
    setIsLoading(true);
    // Store the current options in cookies before redirecting
    document.cookie = `spotify_timeRange=${encodeURIComponent(timeRange)}; path=/; max-age=3600`;
    document.cookie = `spotify_trackLimit=${encodeURIComponent(trackLimit)}; path=/; max-age=3600`;
    const url = spotifyApi.getAuthUrl(timeRange, trackLimit);
    window.location.href = url;
  };

  const handleDisconnect = () => {
    // Clear all cookies
    document.cookie = 'spotify_name=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'spotify_tracks=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'spotify_timeRange=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'spotify_trackLimit=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'spotify_refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    
    // Reset state to default values
    setDisplayName(null);
    setTracks([]);
    setTimeRange('short_term');
    setTrackLimit('10');
    toast.success('Successfully disconnected from Spotify', { duration: 4000 });
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    const cookies = parseCookies();
    
    // Check if options have changed
    const optionsChanged = 
      cookies.spotify_timeRange !== timeRange || 
      cookies.spotify_trackLimit !== trackLimit;

    if (optionsChanged) {
      console.log('Options changed, fetching new data...');
      try {
        // Store the new options in cookies before making the request
        document.cookie = `spotify_timeRange=${encodeURIComponent(timeRange)}; path=/; max-age=3600`;
        document.cookie = `spotify_trackLimit=${encodeURIComponent(trackLimit)}; path=/; max-age=3600`;

        // Make API call to refresh endpoint
        const response = await fetch('/api/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timeRange,
            trackLimit
          })
        });

        if (!response.ok) {
          throw new Error('Failed to refresh data');
        }

        // Force a check of the data after the refresh
        const updatedCookies = parseCookies();
        if (updatedCookies.spotify_tracks) {
          setTracks(updatedCookies.spotify_tracks);
          toast.success('Successfully refreshed your top tracks', { duration: 4000 });
        }
      } catch (error) {
        console.error('Error refreshing data:', error);
        toast.error('Failed to refresh data. Please try again.');
      }
    } else {
      console.log('Options unchanged, no refresh needed');
      toast('No changes to refresh', {
        icon: '🤔',
        duration: 4000
      });
    }
    setIsLoading(false);
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setIsGeneratingImage(true);
    setError(null);
    // Clear existing results
    setAnalysis(null);
    setImageUrl(null);

    try {
      console.log('🚀 Starting analysis and image generation asynchronously...');
      
      // Start analysis task
      fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName
        })
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(errorData => {
            if (errorData.code === 'content_policy_violation') {
              toast((t) => (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚠️</span>
                    <div className="space-y-1">
                      <div>Content policy violation: Some of your track names or artists may not be appropriate for analysis. Please try refreshing your tracks.</div>
                      <div className="text-sm opacity-80">Error: {errorData.message || JSON.stringify(errorData)}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => toast.dismiss(t.id)}
                    className="shrink-0 px-4 py-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              ), {
                duration: Infinity,
                style: {
                  maxWidth: '500px',
                  background: '#2D3142',
                  color: '#fff',
                },
              });
              setIsAnalyzing(false);
              return null;
            }
            return null;
          });
        }
        return response.json();
      })
      .then(data => {
        if (data && data.analysis) {
          console.log('✍️ Received text analysis:', {
            previewLength: data.analysis.length,
            preview: data.analysis.substring(0, 50) + '...'
          });
          setAnalysis(data.analysis);
          setIsAnalyzing(false);
          toast.success('Generated your music nerd profile!', { duration: 4000 });
        }
      })
      .catch(error => {
        console.error('Analysis task failed:', error);
        setIsAnalyzing(false);
        toast((t) => (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">❌</span>
              <div className="space-y-1">
                <div>Failed to generate profile analysis. Please try again.</div>
                <div className="text-sm opacity-80">Error: {error instanceof Error ? error.message : 'Unknown error'}</div>
              </div>
            </div>
            <button 
              onClick={() => toast.dismiss(t.id)}
              className="shrink-0 px-4 py-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
            >
              Dismiss
            </button>
          </div>
        ), {
          duration: Infinity,
          style: {
            maxWidth: '500px',
            background: '#2D3142',
            color: '#fff',
          },
        });
      });

      // Start image generation task
      fetch('/api/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(errorData => {
            if (errorData.code === 'content_policy_violation' || errorData.message?.includes('safety system')) {
              toast((t) => (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚠️</span>
                    <div className="space-y-1">
                      <div>Content policy violation: The generated image may not be appropriate. Please try again.</div>
                      <div className="text-sm opacity-80">Error: {errorData.message || JSON.stringify(errorData)}</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => toast.dismiss(t.id)}
                    className="shrink-0 px-4 py-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              ), {
                duration: Infinity,
                style: {
                  maxWidth: '500px',
                  background: '#2D3142',
                  color: '#fff',
                },
              });
              setIsGeneratingImage(false);
              return null;
            }
            // Handle other error cases
            toast((t) => (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">❌</span>
                  <div className="space-y-1">
                    <div>Failed to generate profile image. Please try again.</div>
                    <div className="text-sm opacity-80">Error: {errorData.message || JSON.stringify(errorData)}</div>
                  </div>
                </div>
                <button 
                  onClick={() => toast.dismiss(t.id)}
                  className="shrink-0 px-4 py-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            ), {
              duration: Infinity,
              style: {
                maxWidth: '500px',
                background: '#2D3142',
                color: '#fff',
              },
            });
            setIsGeneratingImage(false);
            return null;
          });
        }
        return response.json();
      })
      .then(data => {
        if (data && data.imageUrl) {
          console.log('🎨 Received generated image URL:', {
            preview: data.imageUrl.substring(0, 50) + '...'
          });
          setImageUrl(data.imageUrl);
          setIsGeneratingImage(false);
          toast.success('Generated your profile image!', { duration: 4000 });
        }
      })
      .catch(error => {
        console.error('Image generation task failed:', error);
        setIsGeneratingImage(false);
        toast((t) => (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">❌</span>
              <div className="space-y-1">
                <div>Failed to generate profile image. Please try again.</div>
                <div className="text-sm opacity-80">Error: {error instanceof Error ? error.message : 'Unknown error'}</div>
              </div>
            </div>
            <button 
              onClick={() => toast.dismiss(t.id)}
              className="shrink-0 px-4 py-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
            >
              Dismiss
            </button>
          </div>
        ), {
          duration: Infinity,
          style: {
            maxWidth: '500px',
            background: '#2D3142',
            color: '#fff',
          },
        });
      });

    } catch (error) {
      console.error('❌ Error in generation:', error);
      toast((t) => (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">❌</span>
            <div className="space-y-1">
              <div>Failed to generate profile. Please try again.</div>
              <div className="text-sm opacity-80">Error: {error instanceof Error ? error.message : 'Unknown error'}</div>
            </div>
          </div>
          <button 
            onClick={() => toast.dismiss(t.id)}
            className="shrink-0 px-4 py-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
          >
            Dismiss
          </button>
        </div>
      ), {
        duration: Infinity,
        style: {
          maxWidth: '500px',
          background: '#2D3142',
          color: '#fff',
        },
      });
    }
  };

  return (
    <main className="min-h-screen p-8 bg-white">
      <Toaster 
        position="top-center"
        toastOptions={{
          duration: Infinity,
          style: {
            background: '#2D3142',
            color: '#fff',
          },
          success: {
            duration: 4000,
            iconTheme: {
              primary: '#4CAF50',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ff4b4b',
              secondary: '#fff',
            },
          },
        }}
      />
      <div className="max-w-md mx-auto text-center pt-20">
        {displayName && (
          <div className="absolute top-8 left-8 right-8 flex justify-between items-center">
            <p className="text-lg text-gray-700">Connected as {displayName}</p>
            <button
              onClick={handleDisconnect}
              className="bg-red-500 text-white px-4 py-2 rounded-full hover:bg-red-600 transition-colors text-sm"
            >
              Disconnect
            </button>
          </div>
        )}

        <h1 className="mb-2">
          <span className="block text-6xl font-bold text-pink-400 mb-2">music nerd</span>
          <span className="block text-3xl font-bold text-[#2D3142] tracking-wider">PROFILE PLAYGROUND</span>
        </h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {!displayName ? (
          <div className="space-y-8 mt-12">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-left text-lg font-bold text-gray-700">Time Frame:</label>
                <div className="mt-2">
                  <select
                    value={timeRange}
                    onChange={(e) => setTimeRange(e.target.value)}
                    className="w-full h-10 px-3 border rounded-lg bg-white text-sm text-[#2D3142]"
                  >
                    <option value="short_term">Last Month</option>
                    <option value="medium_term">Last 6 Months</option>
                    <option value="long_term">All Time</option>
                  </select>
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-left text-lg font-bold text-gray-700">Number of Tracks:</label>
                <div className="mt-2">
                  <select
                    value={trackLimit}
                    onChange={(e) => setTrackLimit(e.target.value)}
                    className="w-full h-10 px-3 border rounded-lg bg-white text-sm text-[#2D3142]"
                  >
                    <option value="10">10 Tracks</option>
                    <option value="20">20 Tracks</option>
                  </select>
                </div>
              </div>
            </div>
            <button
              onClick={handleConnect}
              disabled={isLoading}
              className="w-full bg-[#4CAF50] text-white text-lg font-medium px-6 py-3 rounded-full hover:bg-[#45a049] disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Connecting...' : 'Connect to Spotify'}
            </button>
          </div>
        ) : (
          <div className="space-y-8 mt-12">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-left text-lg font-bold text-gray-700">Time Frame:</label>
                <div className="mt-2">
                  <select
                    value={timeRange}
                    onChange={(e) => setTimeRange(e.target.value)}
                    className="w-full h-10 px-3 border rounded-lg bg-white text-sm text-[#2D3142]"
                  >
                    <option value="short_term">Last Month</option>
                    <option value="medium_term">Last 6 Months</option>
                    <option value="long_term">All Time</option>
                  </select>
                </div>
              </div>
              <div className="flex-1 flex gap-2">
                <div className="flex-1">
                  <label className="block text-left text-lg font-bold text-gray-700">Number of Tracks:</label>
                  <div className="flex gap-2 mt-2">
                    <select
                      value={trackLimit}
                      onChange={(e) => setTrackLimit(e.target.value)}
                      className="w-full h-10 px-3 border rounded-lg bg-white text-sm text-[#2D3142]"
                    >
                      <option value="10">10 Tracks</option>
                      <option value="20">20 Tracks</option>
                    </select>
                    <div className="flex-none">
                      <button
                        onClick={handleRefresh}
                        disabled={isLoading}
                        className="w-10 h-10 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 transition-colors flex items-center justify-center shrink-0"
                      >
                        {isLoading ? (
                          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {tracks.length > 0 && (
              <>
                <div className="mt-8 text-left">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                    {tracks.map((track, index) => (
                      <div key={index} className="text-[#2D3142] text-base">
                        <span className="font-bold">{track.name}</span>
                        <span className="mx-2"> - </span>
                        <span className="italic">{track.artist}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8">
                  <h2 className="text-lg font-bold text-[#2D3142] mb-4 text-left">Generate with:</h2>
                  <div className="w-full h-10 px-3 border rounded-lg bg-white text-sm mb-4 flex items-center text-[#2D3142]">
                    OpenAI
                  </div>
                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="w-full bg-pink-400 text-white text-lg font-medium px-6 py-3 rounded-full hover:bg-pink-500 disabled:opacity-50 transition-colors"
                  >
                    {isAnalyzing ? 'Analyzing...' : 'Generate Music Nerd Profile'}
                  </button>
                  {(isAnalyzing || isGeneratingImage || analysis) && (
                    <div className="mt-8">
                      <h2 className="text-2xl font-bold text-[#2D3142] mb-6 text-left">Music Nerd Profile</h2>
                      <div className="flex gap-8">
                        <div className="flex-1">
                          {isAnalyzing ? (
                            <div className="border border-[#2D3142]/20 rounded-lg p-6 space-y-4">
                              <div className="h-6 bg-gray-200 rounded animate-pulse w-3/4"></div>
                              <div className="h-6 bg-gray-200 rounded animate-pulse w-1/2"></div>
                              <div className="h-6 bg-gray-200 rounded animate-pulse w-5/6"></div>
                              <div className="h-6 bg-gray-200 rounded animate-pulse w-2/3"></div>
                              <div className="h-6 bg-gray-200 rounded animate-pulse w-4/5"></div>
                              <div className="h-6 bg-gray-200 rounded animate-pulse w-3/4"></div>
                              <div className="h-6 bg-gray-200 rounded animate-pulse w-5/6"></div>
                              <div className="h-6 bg-gray-200 rounded animate-pulse w-2/3"></div>
                            </div>
                          ) : analysis && (
                            <div className="text-[#2D3142] text-left whitespace-pre-wrap text-lg leading-relaxed border border-[#2D3142]/20 rounded-lg p-6">
                              {analysis}
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          {isGeneratingImage ? (
                            <div className="aspect-square bg-gray-200 rounded-lg animate-pulse">
                              <div className="h-full flex items-center justify-center text-gray-500">
                                Generating image...
                              </div>
                            </div>
                          ) : imageUrl && (
                            <div className="space-y-4">
                              <div className="relative aspect-square rounded-lg overflow-hidden">
                                <Image 
                                  src={imageUrl} 
                                  alt="Generated music nerd profile visualization" 
                                  fill
                                  className="object-cover rounded-lg shadow-lg"
                                  onError={() => {
                                    console.error('Failed to load image:', imageUrl);
                                    toast((t) => (
                                      <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xl">❌</span>
                                          <div className="space-y-1">
                                            <div>Failed to load the generated image.</div>
                                            <div className="text-sm opacity-80">URL: {imageUrl}</div>
                                          </div>
                                        </div>
                                        <button 
                                          onClick={() => toast.dismiss(t.id)}
                                          className="shrink-0 px-4 py-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                                        >
                                          Dismiss
                                        </button>
                                      </div>
                                    ), {
                                      duration: Infinity,
                                      style: {
                                        maxWidth: '500px',
                                        background: '#2D3142',
                                        color: '#fff',
                                      },
                                    });
                                  }}
                                  onLoadingComplete={() => {
                                    console.log('Image loaded successfully:', imageUrl);
                                  }}
                                />
                              </div>
                              {imageUrl && (
                                <a 
                                  href={imageUrl}
                                  download="music-nerd-profile.png"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full flex items-center justify-center gap-2 bg-white text-[#2D3142] text-base font-medium px-4 py-2 rounded-lg border border-[#2D3142]/20 hover:bg-gray-50 transition-colors"
                                  title="Download Image"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="relative top-[0.5px]">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                  </svg>
                                  Download Image
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
