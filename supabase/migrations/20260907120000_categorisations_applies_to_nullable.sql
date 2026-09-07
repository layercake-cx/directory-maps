-- ============================================================
-- Migration: 20260907120000_categorisations_applies_to_nullable
-- Description: Drops the NOT NULL constraint on categorisations.applies_to.
--              20260829040000_create_categorisation_attachments.sql replaced
--              applies_to (directory/entry/both) with the explicit
--              categorisation_attachments model and deliberately left the
--              column's NOT NULL constraint untouched, flagging it as "a
--              separate, standalone, explicitly-flagged migration" per this
--              policy's rule against bundling destructive/constraint changes
--              with additive ones. That follow-up never happened, so every
--              categorisation create from the UI (createCategorisation in
--              src/lib/categorisations.js, which has never populated
--              applies_to) has been failing with:
--                null value in column "applies_to" of relation
--                "categorisations" violates not-null constraint
--              This migration only relaxes the constraint — it does not drop
--              the column (that stays a separate, later decision) and does
--              not touch any existing row's data.
-- Affected tables: categorisations (constraint change only, no data change)
-- Rollback: _20260907120000_categorisations_applies_to_nullable.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-07
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisations' and column_name = 'applies_to'
  ) then
    raise exception 'ABORT: column public.categorisations.applies_to does not exist';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisations' and column_name = 'applies_to'
      and is_nullable = 'YES'
  ) then
    raise exception 'ABORT: categorisations.applies_to is already nullable — migration may have already run';
  end if;
end $$;

-- CAPTURE PRE-STATE
select
  count(*) as total_categorisations,
  count(*) filter (where applies_to is null) as null_applies_to
from public.categorisations;
-- Expected: null_applies_to = 0 (NOT NULL constraint currently enforced)


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.categorisations
  alter column applies_to drop not null;

comment on column public.categorisations.applies_to is
  'Legacy — superseded by categorisation_attachments (20260829040000). No longer written by app code; nullable since 20260907120000 so creating a categorisation no longer requires a value here. Kept for now; dropping the column is a separate, later migration.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisations' and column_name = 'applies_to'
      and is_nullable = 'NO'
  ) then
    raise exception 'VERIFY FAILED: categorisations.applies_to is still NOT NULL';
  end if;
  raise notice 'VERIFY PASSED: categorisations.applies_to is now nullable';
end $$;

-- Confirm row count + existing data unchanged
select
  count(*) as total_categorisations,
  count(*) filter (where applies_to is null) as null_applies_to
from public.categorisations;
-- Expected: total_categorisations unchanged from pre-state; null_applies_to
-- still 0 for existing rows (only NEW inserts may now omit the value).

-- ------------------------------------------------------------
-- INTEGRITY VERIFICATION CHECKLIST (docs/DATABASE_MIGRATIONS.md)
-- ------------------------------------------------------------
-- 1. Row counts
-- select
--   'clients'   as tbl, count(*) as rows from public.clients union all
--   select 'maps',      count(*) from public.maps              union all
--   select 'groups',    count(*) from public.groups            union all
--   select 'listings',  count(*) from public.listings          union all
--   select 'profiles',  count(*) from public.profiles
-- order by tbl;
--
-- 2. RLS still enabled on categorisations
-- select tablename, rowsecurity from pg_tables
-- where schemaname = 'public' and tablename = 'categorisations';
-- Expected: rowsecurity = true
