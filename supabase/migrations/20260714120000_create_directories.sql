-- ============================================================
-- Migration: 20260714120000_create_directories
-- Description: Foundation tables for the new "Directories" feature
--              (docs/DIRECTORIES.md, epic DIR-E1). Directory is the
--              peer of Map; directory_entries is the peer of listings.
--              Creates four new tables:
--                - directories                    (peer of maps)
--                - directory_groups                (peer of groups, per-directory)
--                - directory_entries                (peer of listings)
--                - contact_directory_permissions    (peer of contact_map_permissions)
--              Tenant-scoped RLS mirrors maps/groups/listings exactly
--              (admin_all + own_client). No anon_select policies yet —
--              publishing (current_publication_id/published_at) is out
--              of scope for this migration and lands with DIR-E2.
-- Affected tables: directories, directory_groups, directory_entries,
--                   contact_directory_permissions (all new)
-- Rollback: _20260714120000_create_directories.rollback.sql
-- Author: Claude Code
-- Date: 2026-07-14
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
    where table_schema = 'public' and table_name = 'clients'
  ) then
    raise exception 'ABORT: table public.clients does not exist';
  end if;
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'contacts'
  ) then
    raise exception 'ABORT: table public.contacts does not exist';
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
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'groups',    count(*) from public.groups            union all
  select 'listings',  count(*) from public.listings           union all
  select 'contacts',  count(*) from public.contacts
order by tbl;
-- Save this output. You will compare it to the post-migration counts.

-- C) Idempotency guard — the new tables must NOT already exist
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('directories', 'directory_groups', 'directory_entries', 'contact_directory_permissions')
  ) then
    raise exception 'ABORT: one of the directories tables already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Directories (peer of maps — id is a client-generated text id, same convention)
create table public.directories (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  name text not null,
  slug text not null,
  description text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index directories_client_slug_key
  on public.directories (client_id, slug);

create index idx_directories_client_id on public.directories(client_id);

comment on table public.directories is
  'A client-owned directory of entries (docs/DIRECTORIES.md DIR-E1) — the peer of maps.';

-- 2) Directory groups (peer of groups — simple, single-value, per-directory grouping)
create table public.directory_groups (
  id uuid primary key default gen_random_uuid(),
  directory_id text not null references public.directories(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  color text null
);

create index idx_directory_groups_directory_id on public.directory_groups(directory_id);

comment on table public.directory_groups is
  'Simple single-value grouping per directory (peer of groups). Kept distinct from the richer, client-wide categorisation model (DIR-E5) — see docs/DIRECTORIES.md §4.2.';

-- 3) Directory entries (peer of listings — the seed schema, reconciled per docs/DIRECTORIES.md §4.2)
create table public.directory_entries (
  id text primary key,
  directory_id text not null references public.directories(id) on delete cascade,
  directory_group_id uuid null references public.directory_groups(id) on delete set null,
  name text not null,
  address text null,
  postcode text null,
  country text null,
  city text null,
  lat double precision null,
  lng double precision null,
  website_url text null,
  email text null,
  phone text null,
  logo_url text null,
  notes_html text null,
  allow_html boolean not null default false,
  geocode_status text null,
  is_active boolean not null default true,
  source text not null default 'manual' check (source in ('manual', 'csv', 'integration')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_directory_entries_directory_id on public.directory_entries(directory_id);
create index idx_directory_entries_group_id on public.directory_entries(directory_group_id);

comment on table public.directory_entries is
  'Entries within a directory (peer of listings). SEO/branding/categorisation columns are added by later epic-specific migrations (DIR-E2/E3/E5), not here.';

-- 4) Contact-level directory permissions (peer of contact_map_permissions)
create table public.contact_directory_permissions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  directory_id text not null references public.directories(id) on delete cascade,
  can_edit_entries boolean not null default true,
  created_at timestamptz not null default now(),
  unique (contact_id, directory_id)
);

create index idx_cdp_contact on public.contact_directory_permissions(contact_id);
create index idx_cdp_directory on public.contact_directory_permissions(directory_id);

comment on table public.contact_directory_permissions is
  'Explicit directory access grants for member contacts (peer of contact_map_permissions). Not yet referenced by RLS below — mirrors contact_map_permissions, which today is also UI-level filtering only, not RLS-enforced.';

-- ------------------------------------------------------------
-- RLS: tenant-scoped exactly like maps/groups/listings today.
-- No anon_select policies yet (no publish concept until DIR-E2).
-- ------------------------------------------------------------

alter table public.directories enable row level security;
alter table public.directory_groups enable row level security;
alter table public.directory_entries enable row level security;
alter table public.contact_directory_permissions enable row level security;

-- ---- directories ----
create policy "directories_admin_all"
  on public.directories for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "directories_own_client"
  on public.directories for all
  to authenticated
  using (client_id = public.current_user_client_id())
  with check (client_id = public.current_user_client_id());

-- ---- directory_groups ----
create policy "directory_groups_admin_all"
  on public.directory_groups for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "directory_groups_own_client"
  on public.directory_groups for all
  to authenticated
  using (
    directory_id in (select id from public.directories where client_id = public.current_user_client_id())
  )
  with check (
    directory_id in (select id from public.directories where client_id = public.current_user_client_id())
  );

-- ---- directory_entries ----
create policy "directory_entries_admin_all"
  on public.directory_entries for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "directory_entries_own_client"
  on public.directory_entries for all
  to authenticated
  using (
    directory_id in (select id from public.directories where client_id = public.current_user_client_id())
  )
  with check (
    directory_id in (select id from public.directories where client_id = public.current_user_client_id())
  );

-- ---- contact_directory_permissions ----
create policy "cdp_admin_all"
  on public.contact_directory_permissions for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

-- Owners/managers: read + manage permissions for all contacts in their org (mirrors cmp_own_client)
create policy "cdp_own_client"
  on public.contact_directory_permissions for all
  to authenticated
  using (
    contact_id in (select id from public.contacts where client_id = public.current_user_client_id())
  )
  with check (
    contact_id in (select id from public.contacts where client_id = public.current_user_client_id())
  );

-- ------------------------------------------------------------
-- Data API grants (RLS still governs; these just let PostgREST reach the tables)
-- ------------------------------------------------------------
grant select, insert, update, delete on table public.directories to authenticated, service_role;
grant select, insert, update, delete on table public.directory_groups to authenticated, service_role;
grant select, insert, update, delete on table public.directory_entries to authenticated, service_role;
grant select, insert, update, delete on table public.contact_directory_permissions to authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- Run immediately after applying. All assertions must pass.
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'directories') then
    raise exception 'VERIFY FAILED: directories was not created';
  end if;
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'directory_groups') then
    raise exception 'VERIFY FAILED: directory_groups was not created';
  end if;
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'directory_entries') then
    raise exception 'VERIFY FAILED: directory_entries was not created';
  end if;
  if not exists (select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'contact_directory_permissions') then
    raise exception 'VERIFY FAILED: contact_directory_permissions was not created';
  end if;
  raise notice 'VERIFY PASSED: directories tables created';
end $$;

-- Row counts — clients/maps/groups/listings/contacts must be UNCHANGED from pre-migration.
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'groups',    count(*) from public.groups            union all
  select 'listings',  count(*) from public.listings           union all
  select 'contacts',  count(*) from public.contacts
order by tbl;

-- New tables must start empty
select
  'directories'                     as tbl, count(*) as rows from public.directories                     union all
  select 'directory_groups',                count(*) from public.directory_groups                        union all
  select 'directory_entries',               count(*) from public.directory_entries                        union all
  select 'contact_directory_permissions',   count(*) from public.contact_directory_permissions
order by tbl;

-- RLS enabled on core + new tables
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'clients','maps','groups','listings','profiles','contacts',
    'directories','directory_groups','directory_entries','contact_directory_permissions'
  )
order by tablename;
-- All rows must show rowsecurity = true

-- Orphan checks (existing)
select count(*) as orphaned_maps      from public.maps     m where not exists (select 1 from public.clients c where c.id = m.client_id);
select count(*) as orphaned_listings  from public.listings l where not exists (select 1 from public.maps    m where m.id = l.map_id);
select count(*) as orphaned_groups    from public.groups   g where not exists (select 1 from public.maps    m where m.id = g.map_id);

-- Orphan checks (new directories tables) — all must return 0
select count(*) as orphaned_directories
  from public.directories d where not exists (select 1 from public.clients c where c.id = d.client_id);
select count(*) as orphaned_directory_groups
  from public.directory_groups g where not exists (select 1 from public.directories d where d.id = g.directory_id);
select count(*) as orphaned_directory_entries
  from public.directory_entries e where not exists (select 1 from public.directories d where d.id = e.directory_id);
select count(*) as orphaned_directory_entries_group
  from public.directory_entries e where e.directory_group_id is not null
    and not exists (select 1 from public.directory_groups g where g.id = e.directory_group_id);
select count(*) as orphaned_cdp
  from public.contact_directory_permissions p where not exists (select 1 from public.contacts c where c.id = p.contact_id);
-- All must return 0
