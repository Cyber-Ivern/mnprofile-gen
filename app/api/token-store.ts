import { supabase } from './supabase';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Bot token management (using Supabase)
export async function getBotToken(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('spotify_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error getting bot token:', error);
      return null;
    }

    return data?.access_token || null;
  } catch (error) {
    console.error('Error getting bot token:', error);
    return null;
  }
}

export async function setBotToken(userId: string, token: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('spotify_tokens')
      .upsert({
        user_id: userId,
        access_token: token,
      }, {
        onConflict: 'user_id'
      });

    if (error) throw error;
  } catch (error) {
    console.error('Error setting bot token:', error);
    throw error;
  }
}

export async function deleteBotToken(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('spotify_tokens')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting bot token:', error);
    throw error;
  }
}

// Track cache management (using Supabase)
export async function getCachedTracks(userId: string): Promise<any[] | null> {
  try {
    const { data, error } = await supabase
      .from('track_cache')
      .select('tracks, created_at')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error getting cached tracks:', error);
      return null;
    }

    if (!data) return null;

    // Check if cache is expired
    const createdAt = new Date(data.created_at).getTime();
    if (Date.now() - createdAt > CACHE_DURATION) {
      // Delete expired cache
      await supabase
        .from('track_cache')
        .delete()
        .eq('user_id', userId);
      return null;
    }

    return data.tracks;
  } catch (error) {
    console.error('Error getting cached tracks:', error);
    return null;
  }
}

export async function setCachedTracks(userId: string, tracks: any[]): Promise<void> {
  try {
    const { error } = await supabase
      .from('track_cache')
      .upsert({
        user_id: userId,
        tracks,
      }, {
        onConflict: 'user_id'
      });

    if (error) throw error;
  } catch (error) {
    console.error('Error setting cached tracks:', error);
    throw error;
  }
}

// Helper function to check if a token exists (for bot)
export async function hasBotToken(userId: string): Promise<boolean> {
  const token = await getBotToken(userId);
  return token !== null;
}

// Optional: Function to clean up old cache entries
export async function cleanupOldCache(): Promise<void> {
  try {
    const { error } = await supabase
      .from('track_cache')
      .delete()
      .lt('created_at', new Date(Date.now() - CACHE_DURATION).toISOString());

    if (error) throw error;
  } catch (error) {
    console.error('Error cleaning up old cache:', error);
    throw error;
  }
} 