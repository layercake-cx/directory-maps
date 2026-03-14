-- Google Sheet sync configuration per map.
-- Run in Supabase Dashboard → SQL Editor.
--
-- Notes:
-- - maps.id is TEXT in this project, so map_id is TEXT.
-- - We enable RLS with no policies so data is only accessible server-side (service role / edge functions).
-- - This table stores Google OAuth refresh tokens. Do NOT expose it to the browser.

create extension if not exists pgcrypto;

create table if not exists public.map_data_sources (
  id uuid primary key default gen_random_uuid(),
  map_id text not null references public.maps(id) on delete cascade,

  provider text not null default 'google_sheets',

  -- Google Drive/Sheets identifiers
  drive_file_id text null,
  spreadsheet_id text null,
  sheet_name text null,
  sheet_id integer null,

  -- OAuth token for server-side refresh
  refresh_token text not null,

  enabled boolean not null default true,

  last_synced_at timestamptz null,
  last_sync_status text null,
  last_sync_error text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_map_data_sources_map_id on public.map_data_sources(map_id);
create index if not exists idx_map_data_sources_enabled on public.map_data_sources(enabled);

alter table public.map_data_sources enable row level security;

-- Intentionally no RLS policies (deny-by-default for anon/authenticated).
