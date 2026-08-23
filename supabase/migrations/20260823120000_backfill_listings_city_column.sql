-- ============================================================
-- Migration: 20260823120000_backfill_listings_city_column
-- Description: Adds listings.city (nullable text) where it is missing.
--              This is a DRIFT-REPAIR migration, not a fresh column add:
--              `city` has been part of the base `create table if not
--              exists public.listings (...)` definition since the base
--              migration, but on any environment where the `listings`
--              table already existed before `city` was added to that
--              file, `create table if not exists` silently skipped it —
--              there was never a standalone `alter table ... add column`
--              for it. Production is one such environment (confirmed via
--              a live REST query: the column is entirely absent, not
--              merely null). Staging already has it. Because the two
--              environments are intentionally out of sync going in, this
--              migration is written to be a safe no-op wherever the
--              column already exists, rather than aborting like a normal
--              "guard against re-running" check would.
-- Affected tables: listings
-- Rollback: 20260823120000_backfill_listings_city_column.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-23
-- ============================================================

-- PRE-MIGRATION INTEGRITY CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'listings'
  ) then
    raise exception 'ABORT: table public.listings does not exist';
  end if;
end $$;

-- CAPTURE PRE-STATE
select count(*) as total_listings from public.listings;


-- ============================================================
-- THE MIGRATION
-- ============================================================

alter table public.listings
  add column if not exists city text null;

comment on column public.listings.city is
  'City name, if provided by the data source. Nullable — most rows rely on address/postcode/country instead.';


-- ============================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'city'
  ) then
    raise exception 'VERIFY FAILED: column city was not created';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'city'
      and is_nullable = 'NO'
  ) then
    raise exception 'VERIFY FAILED: city should be nullable but is NOT NULL';
  end if;

  raise notice 'VERIFY PASSED: listings.city exists and is nullable';
end $$;

-- Confirm row count is unchanged (no accidental data loss)
select
  count(*)                               as total_listings,
  count(*) filter (where city is not null) as listings_with_city
from public.listings;
-- Expected: total_listings unchanged


-- ============================================================
-- INTEGRITY CHECKLIST (run before and after on every environment)
-- ============================================================
/*
select 'clients'  as tbl, count(*) as rows from public.clients union all
select 'maps',     count(*) from public.maps              union all
select 'groups',   count(*) from public.groups            union all
select 'listings', count(*) from public.listings          union all
select 'profiles', count(*) from public.profiles
order by tbl;
*/
