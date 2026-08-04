-- ============================================================
-- Migration: 20260716120000_create_directory_map_associations
-- Description: Map <-> Directory association (docs/DIRECTORIES.md,
--              epic DIR-E8). One join table expresses both directions
--              of the relationship via a `role` column:
--                - 'embedded_on_directory'   a map is embedded on a
--                                            directory's pages (built now)
--                - 'directory_as_datasource' a map's pins are sourced
--                                            from a directory's published
--                                            entries (DIR-E4 — schema
--                                            reserved here, not used yet)
--              This migration only creates the table + RLS. It does not
--              touch `map_data_sources`/`listings` (per §4.7 decision:
--              a directory-sourced map reads directly and live, no sync).
-- Affected tables: directory_map_associations (new)
-- Rollback: _20260716120000_create_directory_map_associations.rollback.sql
-- Author: Claude Code
-- Date: 2026-07-16
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- If no error appears, the dry run passed. Then apply for real.
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- Run these BEFORE applying. Stop if any assertion fails.
-- ------------------------------------------------------------

-- A) Confirm the tables we reference exist
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directories'
  ) then
    raise exception 'ABORT: table public.directories does not exist (run 20260714120000_create_directories.sql first)';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'maps'
  ) then
    raise exception 'ABORT: table public.maps does not exist';
  end if;
  if not exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'current_user_client_id'
  ) then
    raise exception 'ABORT: function public.current_user_client_id() does not exist';
  end if;
end $$;

-- B) Row counts — inspect before proceeding
select
  'clients'      as tbl, count(*) as rows from public.clients     union all
  select 'directories',   count(*) from public.directories        union all
  select 'maps',          count(*) from public.maps
order by tbl;
-- Save this output. You will compare it to the post-migration counts.

-- C) Idempotency guard — the new table must NOT already exist
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directory_map_associations'
  ) then
    raise exception 'ABORT: public.directory_map_associations already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- Join table expressing both directions of the map <-> directory
-- relationship (docs/DIRECTORIES.md §4.7). Many-to-many: a directory can
-- have several associated maps, and (schema-wise, though not exercised by
-- DIR-E8) a map could carry more than one role row for a given directory.
create table public.directory_map_associations (
  directory_id text not null references public.directories(id) on delete cascade,
  map_id text not null references public.maps(id) on delete cascade,
  role text not null check (role in ('embedded_on_directory', 'directory_as_datasource')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (directory_id, map_id, role)
);

create index idx_dma_directory on public.directory_map_associations(directory_id);
create index idx_dma_map on public.directory_map_associations(map_id);

comment on table public.directory_map_associations is
  'Map <-> Directory association (docs/DIRECTORIES.md DIR-E8/DIR-E4). role=embedded_on_directory is built by DIR-E8; role=directory_as_datasource is reserved for DIR-E4, not used yet.';

-- ------------------------------------------------------------
-- RLS: tenant-scoped like directories/categorisations today.
-- own_client checks BOTH sides of the join — the directory AND the map
-- must belong to the caller's client — so a client can never link a
-- directory to (or embed) another tenant's map.
-- No anon_select policy yet (no publish concept until DIR-E2).
-- ------------------------------------------------------------

alter table public.directory_map_associations enable row level security;

create policy "dma_admin_all"
  on public.directory_map_associations for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "dma_own_client"
  on public.directory_map_associations for all
  to authenticated
  using (
    directory_id in (select id from public.directories where client_id = public.current_user_client_id())
    and map_id in (select id from public.maps where client_id = public.current_user_client_id())
  )
  with check (
    directory_id in (select id from public.directories where client_id = public.current_user_client_id())
    and map_id in (select id from public.maps where client_id = public.current_user_client_id())
  );

-- ------------------------------------------------------------
-- Data API grants (RLS still governs; these just let PostgREST reach the table)
-- ------------------------------------------------------------
grant select, insert, update, delete on table public.directory_map_associations to authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- Run immediately after applying. All assertions must pass.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'directory_map_associations') then
    raise exception 'VERIFY FAILED: directory_map_associations was not created';
  end if;
  raise notice 'VERIFY PASSED: directory_map_associations created';
end $$;

-- Row counts — clients/directories/maps must be UNCHANGED from pre-migration.
select
  'clients'      as tbl, count(*) as rows from public.clients     union all
  select 'directories',   count(*) from public.directories        union all
  select 'maps',          count(*) from public.maps
order by tbl;

-- New table must start empty
select count(*) as rows from public.directory_map_associations;

-- RLS enabled on core + new table
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('clients', 'directories', 'maps', 'directory_map_associations')
order by tablename;
-- All rows must show rowsecurity = true

-- Orphan checks — all must return 0
select count(*) as orphaned_dma_directory
  from public.directory_map_associations x where not exists (select 1 from public.directories d where d.id = x.directory_id);
select count(*) as orphaned_dma_map
  from public.directory_map_associations x where not exists (select 1 from public.maps m where m.id = x.map_id);
