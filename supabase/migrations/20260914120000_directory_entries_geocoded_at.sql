-- ============================================================
-- Migration: 20260914120000_directory_entries_geocoded_at
-- Description: Adds geocoded_at to directory_entries (peer of
--              listings.geocoded_at, added by 20250202000000). Directory
--              entries have never had a geocoding pipeline wired up at all
--              (geocode_status has sat unused since 20260714120000) — this
--              was discovered as the root cause of a production bug where a
--              map sourcing pins from a directory (DIR-E4-S2) showed zero
--              pins despite the directory having entries with valid
--              addresses. Fixed alongside this migration by a new
--              geocode_directory_entries Edge Function (mirrors
--              geocode_listings) and UI wiring in DirectoryEntriesPanel.
-- Affected tables: directory_entries (1 new column)
-- Rollback: _20260914120000_directory_entries_geocoded_at.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-14
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
--   BEGIN;
--   <paste "THE MIGRATION" section below>
--   ROLLBACK;
--
-- If no error appears, the dry run passed. Then apply for real.
-- ============================================================

-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directory_entries'
  ) then
    raise exception 'ABORT: table public.directory_entries does not exist';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'geocoded_at'
  ) then
    raise exception 'ABORT: column geocoded_at already exists — migration may have already run';
  end if;
end $$;

-- CAPTURE PRE-STATE — inspect before continuing
select count(*) as total_directory_entries from public.directory_entries;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.directory_entries
  add column if not exists geocoded_at timestamptz null;

comment on column public.directory_entries.geocoded_at is
  'Timestamp of the last geocode attempt (success or failure) for this entry — peer of listings.geocoded_at. Set by the geocode_directory_entries Edge Function alongside geocode_status.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries' and column_name = 'geocoded_at'
  ) then
    raise exception 'VERIFY FAILED: column geocoded_at was not created';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directory_entries'
      and column_name = 'geocoded_at' and is_nullable = 'NO'
  ) then
    raise exception 'VERIFY FAILED: geocoded_at is NOT NULL, expected nullable';
  end if;

  raise notice 'VERIFY PASSED: geocoded_at exists and is nullable';
end $$;

-- Confirm row count is unchanged (no accidental data loss)
select count(*) as total_directory_entries_after from public.directory_entries;

-- ------------------------------------------------------------
-- INTEGRITY VERIFICATION CHECKLIST (run before AND after, on any environment)
-- ------------------------------------------------------------
-- select count(*) as total_directory_entries from public.directory_entries;
-- select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'directory_entries';
-- -- Expected: rowsecurity = true
-- select count(*) as orphaned_entries from public.directory_entries e
--   where not exists (select 1 from public.directories d where d.id = e.directory_id);
-- -- Expected: 0
