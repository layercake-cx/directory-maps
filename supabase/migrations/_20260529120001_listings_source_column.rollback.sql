-- Rollback: 20260529120001_listings_source_column
alter table public.listings drop column if exists source;
