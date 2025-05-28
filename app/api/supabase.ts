import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Types for our database tables
export interface SpotifyToken {
  user_id: string;
  access_token: string;
  refresh_token: string;
  time_range: string;
  track_limit: string;
  created_at: string;
  updated_at: string;
}

export interface TrackCache {
  user_id: string;
  tracks: Array<{
    name: string;
    artists: Array<{ name: string }>;
  }>;
  created_at: string;
}

// SQL for creating the tables (run this in Supabase SQL editor):
/*
-- Create spotify_tokens table
create table spotify_tokens (
  user_id text primary key,
  access_token text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add new columns to spotify_tokens table
alter table spotify_tokens
  add column if not exists refresh_token text,
  add column if not exists time_range text default 'short_term',
  add column if not exists track_limit text default '10';

-- Create track_cache table
create table track_cache (
  user_id text primary key,
  tracks jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create function to automatically update updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Create trigger for spotify_tokens
create trigger update_spotify_tokens_updated_at
  before update on spotify_tokens
  for each row
  execute function update_updated_at_column();

-- Create index on created_at for track_cache to help with cleanup
create index track_cache_created_at_idx on track_cache(created_at);
*/ 