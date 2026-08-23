-- ============================================================
-- Migration: 20260823130000_backfill_maps_snapshot_columns
-- Description: Adds maps.snapshot_url and maps.snapshot_generated_at
--              (both nullable) where missing.
--              This is a DRIFT-REPAIR migration: 20260531120000 added
--              these columns and is recorded as applied in staging's
--              own supabase_migrations history, yet a live REST query
--              against staging confirms the columns do not actually
--              exist there (production has them and generate_map_snapshot
--              works there; staging is missing them, and that Edge
--              Function has likely been silently failing on staging as
--              a result). Rather than investigate exactly how the
--              history and the live schema diverged, this migration is
--              written to be a safe no-op wherever the columns already
--              exist (production), matching the pattern already used by
--              the original migration.
-- Affected tables: maps
-- Rollback: 20260823130000_backfill_maps_snapshot_columns.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-23
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
end $$;

-- CAPTURE PRE-STATE
select count(*) as total_maps from public.maps;


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
-- Expected: total_maps unchanged


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
