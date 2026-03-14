alter table public.maps
  add column if not exists published_config jsonb,
  add column if not exists published_at timestamptz;

