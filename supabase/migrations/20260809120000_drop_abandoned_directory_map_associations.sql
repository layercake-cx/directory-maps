-- ============================================================
-- Migration: 20260809120000_drop_abandoned_directory_map_associations
-- Description: Drops public.directory_map_associations created by the
--              abandoned DIR-E8 (directory→map linking) work. That feature
--              was never merged to main; the correct relationship is DIR-E4
--              (map→directory as datasource). Any staging test rows are
--              discarded — the table must not ship. Safe no-op if the table
--              is already absent (e.g. production never had it).
-- Affected tables: directory_map_associations (drop if exists)
-- Rollback: do not reintroduce embedded_on_directory. See docs/DIRECTORIES.md §4.7.
-- Author: Cursor agent
-- Date: 2026-08-09
-- ============================================================
--
-- RUN ORDER: staging (beqejxneehilplrtpntn) first; production only after sign-off
-- (production should be a no-op — table never existed there).
-- ============================================================

do $$
declare
  n bigint := 0;
begin
  if to_regclass('public.directory_map_associations') is null then
    raise notice 'directory_map_associations already absent — nothing to drop';
    return;
  end if;

  select count(*) into n from public.directory_map_associations;
  if n > 0 then
    raise notice 'Discarding % abandoned DIR-E8 association row(s) before drop', n;
    delete from public.directory_map_associations;
  end if;
end $$;

drop table if exists public.directory_map_associations;

do $$
begin
  if to_regclass('public.directory_map_associations') is not null then
    raise exception 'VERIFY FAILED: directory_map_associations still exists';
  end if;
  raise notice 'VERIFY PASSED: directory_map_associations removed (or was never present)';
end $$;
