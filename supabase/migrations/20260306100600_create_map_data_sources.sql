-- Map data source configuration (Google Sheets sync)
-- See scripts/create-map-data-sources.sql for notes.

create extension if not exists pgcrypto;

create table if not exists public.map_data_sources (
  id uuid primary key default gen_random_uuid(),
  map_id text not null references public.maps(id) on delete cascade,
  provider text not null default 'google_sheets',
  drive_file_id text null,
  spreadsheet_id text null,
  sheet_name text null,
  sheet_id integer null,
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
