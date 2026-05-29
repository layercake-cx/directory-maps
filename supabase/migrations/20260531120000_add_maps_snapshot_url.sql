-- ============================================================
-- Migration: 20260531120000_add_maps_snapshot_url
-- Description: Adds snapshot_url (nullable text) and snapshot_generated_at
--              (nullable timestamptz) to the maps table.
--              snapshot_url points to the CDN copy of the full map snapshot
--              (config + listings + groups) generated on every publish.
--              The embed loads this URL first; Supabase is the fallback.
-- Affected tables: maps
-- Rollback: 20260531120000_add_maps_snapshot_url.rollback.sql
-- Author: Claude Code
-- Date: 2026-05-31
-- ============================================================

-- PRE-MIGRATION INTEGRITY CHECK
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'maps'
  ) then
    raise exception 'ABORT: table public.maps does not exist';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'maps'
      and column_name = 'snapshot_url'
  ) then
    raise exception 'ABORT: column snapshot_url already exists — migration may have already run';
  end if;
end $$;

-- CAPTURE PRE-STATE
select count(*) as total_maps,
       count(*) filter (where snapshot_url is not null) as maps_with_snapshot
from public.maps;
-- Expected: maps_with_snapshot = 0 (column about to be added)


-- ============================================================
-- THE MIGRATION
-- ============================================================

alter table public.maps
  add column if not exists snapshot_url text null,
  add column if not exists snapshot_generated_at timestamptz null;

comment on column public.maps.snapshot_url is
  'CDN URL of the latest static snapshot JSON (config + listings + groups). '
  'Null until first publish after this migration. The embed loads this first '
  'and falls back to live Supabase queries if unavailable.';

comment on column public.maps.snapshot_generated_at is
  'Timestamp when snapshot_url was last written. Used to detect stale snapshots.';


-- ============================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'maps'
      and column_name = 'snapshot_url'
  ) then
    raise exception 'VERIFY FAILED: column snapshot_url was not created';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'maps'
      and column_name = 'snapshot_generated_at'
  ) then
    raise exception 'VERIFY FAILED: column snapshot_generated_at was not created';
  end if;

  raise notice 'VERIFY PASSED: snapshot_url and snapshot_generated_at exist and are nullable';
end $$;

select count(*) as total_maps,
       count(*) filter (where snapshot_url is not null) as maps_with_snapshot
from public.maps;
-- Expected: total_maps unchanged, maps_with_snapshot = 0


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
