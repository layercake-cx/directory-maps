-- ============================================================
-- Migration: 20260917170000_enable_rls_listing_research_backup
-- Description: SECURITY FIX. listing_research_backup_20260906
--              (20260906140000_remove_ai_search_enrichment_schema.sql — a
--              one-time safety backup of listing_research taken
--              immediately before that migration dropped the live table)
--              was created via `create table ... as select ...`, which
--              does NOT inherit row level security. No follow-up `alter
--              table ... enable row level security` was ever added for
--              it, so it has been fully public (any anon or authenticated
--              client could read/edit/delete every row) since 2026-09-06.
--              Flagged by Supabase's security advisor
--              (rls_disabled_in_public) on both layercake-maps-production
--              and layercake-maps-test.
--              Fix: enable RLS with NO policies at all. This is a pure
--              lockdown — the table's own comment already states it is
--              "not read by any application code," so this has zero
--              behavioural impact and touches no data; only a privileged
--              (service-role/superuser) connection can access it from
--              here on, same as before it should have been.
-- Affected tables: listing_research_backup_20260906 (RLS flag only)
-- Rollback: _20260917170000_enable_rls_listing_research_backup.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-17
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> then PRODUCTION (gxixwdjfmegxcxfeflro)
-- after explicit sign-off — though note this table is currently EXPOSED on
-- production right now, so this is a live, active gap, not a preventative one.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_research_backup_20260906') then
    raise exception 'ABORT: table public.listing_research_backup_20260906 does not exist';
  end if;
end $$;

-- Confirm the gap before fixing it (informational — inspect the output).
select relname, relrowsecurity
from pg_class
where relname = 'listing_research_backup_20260906' and relnamespace = 'public'::regnamespace;
-- Expect relrowsecurity = false before this migration runs.

select count(*) as row_count from public.listing_research_backup_20260906;
-- Row count — must be UNCHANGED after (RLS flag only, no data touched).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.listing_research_backup_20260906 enable row level security;

comment on table public.listing_research_backup_20260906 is
  'One-time backup of listing_research taken immediately before 20260906140000_remove_ai_search_enrichment_schema dropped the live table. Not read by any application code — safe to archive/export and drop once no longer needed. RLS enabled with no policies (20260917170000) after this table was found publicly readable/writable since creation — a privileged connection is required to access it.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_class
    where relname = 'listing_research_backup_20260906'
      and relnamespace = 'public'::regnamespace
      and relrowsecurity = true
  ) then
    raise exception 'VERIFY FAILED: RLS was not enabled on listing_research_backup_20260906';
  end if;
  raise notice 'VERIFY PASSED: RLS enabled on listing_research_backup_20260906 (no policies — fully locked down)';
end $$;

-- Row count — must be UNCHANGED from pre-migration (RLS flag only).
select count(*) as row_count from public.listing_research_backup_20260906;

-- Confirm the table is no longer readable by anon/authenticated (should
-- error with "permission denied" or return zero rows depending on role
-- grants — either way, RLS with no policies blocks all row access).
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'listing_research_backup_20260906';
-- Expected: rowsecurity = true
