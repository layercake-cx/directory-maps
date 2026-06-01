-- ============================================================
-- Migration: 20260601110000_add_messaging_to_clients
-- Description: Adds messaging_enabled (toggle) and messaging_prompt (contact-form
--              intro text) to the clients table. Also creates a narrow anon-readable
--              view so the embed can gate the "Send message" button without
--              exposing any other client data.
-- Affected tables: clients; new view: client_messaging_settings
-- Rollback: 20260601110000_add_messaging_to_clients.rollback.sql
-- Author: Claude Code
-- Date: 2026-06-01
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — makes NO persistent changes):
--
--   BEGIN;
--   <paste migration body here>
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
    where table_schema = 'public' and table_name = 'clients'
  ) then
    raise exception 'ABORT: table public.clients does not exist';
  end if;
end $$;

-- Row counts — inspect before proceeding, compare to post-migration output
select
  'clients'  as tbl, count(*) as rows from public.clients union all
  select 'maps',     count(*) from public.maps             union all
  select 'groups',   count(*) from public.groups           union all
  select 'listings', count(*) from public.listings
order by tbl;

-- Idempotency guard: columns must not already exist
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'clients'
      and column_name  = 'messaging_enabled'
  ) then
    raise exception 'ABORT: messaging_enabled already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1. Add columns to clients
alter table public.clients
  add column if not exists messaging_enabled boolean not null default false,
  add column if not exists messaging_prompt  text;

-- 2. Create a narrow view so the anon role (embed) can read only these two fields.
--    PostgREST will expose this as /rest/v1/client_messaging_settings.
create or replace view public.client_messaging_settings
  with (security_invoker = false)
as
  select
    id            as client_id,
    messaging_enabled,
    messaging_prompt
  from public.clients;

-- Grant SELECT to anon (embed) and authenticated (client portal / admin).
grant select on public.client_messaging_settings to anon;
grant select on public.client_messaging_settings to authenticated;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'clients'
      and column_name  = 'messaging_enabled'
  ) then
    raise exception 'VERIFY FAILED: messaging_enabled was not created';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'clients'
      and column_name  = 'messaging_prompt'
  ) then
    raise exception 'VERIFY FAILED: messaging_prompt was not created';
  end if;

  if not exists (
    select 1 from information_schema.views
    where table_schema = 'public'
      and table_name   = 'client_messaging_settings'
  ) then
    raise exception 'VERIFY FAILED: client_messaging_settings view was not created';
  end if;

  raise notice 'VERIFY PASSED: messaging columns and view created';
end $$;

-- Row counts — must match pre-migration (these are schema-only changes)
select
  'clients'  as tbl, count(*) as rows from public.clients union all
  select 'maps',     count(*) from public.maps             union all
  select 'groups',   count(*) from public.groups           union all
  select 'listings', count(*) from public.listings
order by tbl;

-- RLS still enabled
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('clients','maps','groups','listings','profiles','contacts')
order by tablename;

-- Orphan checks (all must return 0)
select count(*) as orphaned_maps     from public.maps     m where not exists (select 1 from public.clients c where c.id = m.client_id);
select count(*) as orphaned_listings from public.listings l where not exists (select 1 from public.maps    m where m.id = l.map_id);
select count(*) as orphaned_groups   from public.groups   g where not exists (select 1 from public.maps    m where m.id = g.map_id);
