-- Optional: timestamp when listing was last geocoded (used by CSV import and sync).
alter table public.listings
  add column if not exists geocoded_at timestamptz null;
