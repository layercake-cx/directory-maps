alter table public.map_data_sources
  add column if not exists sync_schedule text null; -- null = manual only, 'nightly' = daily midnight UTC
