-- ============================================================
-- Migration: YYYYMMDDHHMMSS_short_description
-- Description: <what this migration does and why>
-- Affected tables: <table1>, <table2>
-- Rollback: YYYYMMDDHHMMSS_short_description.rollback.sql
-- Author: <name or agent>
-- Date: YYYY-MM-DD
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
--   BEGIN;
--   <paste migration body here>
--   ROLLBACK;
--
-- If no error appears, the dry run passed. Then apply for real.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- Run these BEFORE applying. Stop if any assertion fails.
-- ------------------------------------------------------------

-- A) Confirm target table(s) exist
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = '<target_table>'
  ) then
    raise exception 'ABORT: table public.<target_table> does not exist';
  end if;
end $$;

-- B) Row counts — inspect before proceeding
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'groups',    count(*) from public.groups            union all
  select 'listings',  count(*) from public.listings
order by tbl;
-- Save this output. You will compare it to the post-migration counts.

-- C) Idempotency guard (adjust to suit — e.g. confirm the column does NOT yet exist)
do $$
begin
  -- Example for an ADD COLUMN migration:
  -- if exists (
  --   select 1 from information_schema.columns
  --   where table_schema = 'public'
  --     and table_name = '<target_table>'
  --     and column_name = '<new_column>'
  -- ) then
  --   raise exception 'ABORT: column already exists — migration may have already run';
  -- end if;
  null; -- replace this with your actual guard
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- <write your DDL / DML here>


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- Run immediately after applying. All assertions must pass.
-- ------------------------------------------------------------

do $$
begin
  -- <assertions that confirm the migration succeeded>
  -- Example:
  -- if not exists (
  --   select 1 from information_schema.columns
  --   where table_schema = 'public'
  --     and table_name = '<target_table>'
  --     and column_name = '<new_column>'
  -- ) then
  --   raise exception 'VERIFY FAILED: <new_column> was not created';
  -- end if;
  -- raise notice 'VERIFY PASSED';
  null; -- replace with your actual checks
end $$;

-- Row counts — compare to pre-migration output. They must match (or change only as expected).
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'groups',    count(*) from public.groups            union all
  select 'listings',  count(*) from public.listings
order by tbl;

-- RLS still enabled
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('clients','maps','groups','listings','profiles','contacts')
order by tablename;
-- All rows must show rowsecurity = true

-- Orphan checks
select count(*) as orphaned_maps      from public.maps     m where not exists (select 1 from public.clients c where c.id = m.client_id);
select count(*) as orphaned_listings  from public.listings l where not exists (select 1 from public.maps    m where m.id = l.map_id);
select count(*) as orphaned_groups    from public.groups   g where not exists (select 1 from public.maps    m where m.id = g.map_id);
-- All must return 0
