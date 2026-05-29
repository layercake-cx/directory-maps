-- ============================================================
-- Migration: 20260529120000_listings_source_column
-- Description: Add source column to listings to track data origin
--              (manual | csv | null=integration-inferred)
-- Affected tables: listings
-- Rollback: _20260529120000_listings_source_column.rollback.sql
-- Author: Claude Code
-- Date: 2026-05-29
-- ============================================================

-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'listings'
  ) then
    raise exception 'ABORT: table public.listings does not exist';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'source'
  ) then
    raise exception 'ABORT: column source already exists — migration may have already run';
  end if;
end $$;

-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.listings
  add column if not exists source text check (source in ('manual', 'csv', 'integration')) default null;

comment on column public.listings.source is
  'How this listing was created: manual (UI form), csv (file upload), integration (auto-sync). NULL = legacy/unknown.';

-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'source'
  ) then
    raise exception 'VERIFY FAILED: source column was not created';
  end if;
  raise notice 'VERIFY PASSED: listings.source column created';
end $$;
