-- Rollback: 20260529120000_listings_source_column
alter table public.listings drop column if exists source;
