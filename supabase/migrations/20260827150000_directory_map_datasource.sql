-- ============================================================
-- Migration: 20260827150000_directory_map_datasource
-- Description: DIR-E4 foundation (docs/DIRECTORIES.md §4.7) — lets a map
--              use a directory's published entries as its live pin
--              datasource, with no sync/copy job. This is the first slice
--              of the "Unify Map & Directory Data Model" epic (Monday item
--              3189433497): existing maps and their live embeds are NOT
--              touched by this migration — it is purely additive.
--
--              1) directory_map_associations — map -> directory, one
--                 directory per map (pk = map_id), a directory may feed
--                 more than one map. Enforced belonging-to-the-same-client
--                 via the attach_directory_to_map() RPC rather than a
--                 table constraint, since that check needs a join across
--                 two tables at write time.
--              2) attach_directory_to_map() / detach_directory_from_map()
--                 — security definer RPCs (mirrors publish_directory's
--                 manual tenant re-check from 20260827120000) so a client
--                 can only attach a directory that belongs to their own
--                 client, and the map<->directory client match is
--                 verified server-side regardless of what RLS alone would
--                 allow.
--              3) public_directory_entries — read-time view (NOT a
--                 publication snapshot; entries are read live exactly like
--                 public_listings reads listings live regardless of a
--                 map's publication version, per the precedent recorded in
--                 20260827120000's own comment). Scoped to is_active = true
--                 and to the owning directory having been published at
--                 least once (current_publication_id is not null), per
--                 DIR-E4-S2's empty-state requirement.
--              4) anon RLS + grants for directories/directory_entries,
--                 published-directories only — deliberately deferred by
--                 20260714120000_create_directories.sql pending "future
--                 client-side standalone map embed" work, which this is.
-- Affected tables: directory_map_associations (new), directories (new RLS
--                   policy only, no column change), directory_entries (new
--                   RLS policy only, no column change)
-- Rollback: _20260827150000_directory_map_datasource.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-27
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'maps') then
    raise exception 'ABORT: table public.maps does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directories') then
    raise exception 'ABORT: table public.directories does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_entries') then
    raise exception 'ABORT: table public.directory_entries does not exist';
  end if;
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'current_user_client_id') then
    raise exception 'ABORT: public.current_user_client_id() does not exist';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_map_associations') then
    raise exception 'ABORT: directory_map_associations already exists — migration may have already run';
  end if;
  if exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'public_directory_entries') then
    raise exception 'ABORT: public_directory_entries already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding
select
  'maps' as tbl, count(*) as rows from public.maps                    union all
  select 'listings', count(*) from public.listings                    union all
  select 'directories', count(*) from public.directories               union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;
-- Save this output. You will compare it to the post-migration counts —
-- this migration must not change any of them (additive only).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) directory_map_associations

create table public.directory_map_associations (
  map_id text primary key references public.maps(id) on delete cascade,
  directory_id text not null references public.directories(id) on delete cascade,
  role text not null default 'directory_as_datasource' check (role = 'directory_as_datasource'),
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id)
);

comment on table public.directory_map_associations is
  'DIR-E4: a map that reads its pins live from a directory instead of its own listings. pk on map_id enforces "one directory datasource per map" (v1 scope, docs/DIRECTORIES.md §4.7); no uniqueness on directory_id, since one directory may feed several maps. Client-match between map and directory is enforced by attach_directory_to_map(), not a table constraint.';

create index idx_directory_map_associations_directory_id on public.directory_map_associations(directory_id);

alter table public.directory_map_associations enable row level security;

create policy "directory_map_associations_admin_all"
  on public.directory_map_associations for all
  to authenticated
  using (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin'));

create policy "directory_map_associations_own_client"
  on public.directory_map_associations for all
  to authenticated
  using (
    map_id in (select id from public.maps where client_id = public.current_user_client_id())
    and directory_id in (select id from public.directories where client_id = public.current_user_client_id())
  )
  with check (
    map_id in (select id from public.maps where client_id = public.current_user_client_id())
    and directory_id in (select id from public.directories where client_id = public.current_user_client_id())
  );

grant select, insert, update, delete on table public.directory_map_associations to authenticated, service_role;

-- 2) attach/detach RPCs — security definer so the cross-entity client-match
--    check runs regardless of what a client-side insert would otherwise be
--    allowed to slip past, mirroring publish_directory's manual re-check.

create or replace function public.attach_directory_to_map(
  p_map_id text,
  p_directory_id text
)
returns public.directory_map_associations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_map_client text;
  v_dir_client text;
  v_assoc       public.directory_map_associations%rowtype;
begin
  select client_id into v_map_client from public.maps where id = p_map_id;
  if not found then
    raise exception 'Map not found';
  end if;

  select client_id into v_dir_client from public.directories where id = p_directory_id;
  if not found then
    raise exception 'Directory not found';
  end if;

  if v_map_client <> v_dir_client then
    raise exception 'Map and directory belong to different clients';
  end if;

  if not (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
    or exists (select 1 from public.contacts where user_id = auth.uid() and client_id = v_map_client)
  ) then
    raise exception 'Access denied';
  end if;

  insert into public.directory_map_associations (map_id, directory_id, created_by)
  values (p_map_id, p_directory_id, auth.uid())
  on conflict (map_id) do update set
    directory_id = excluded.directory_id,
    created_at = now(),
    created_by = excluded.created_by
  returning * into v_assoc;

  return v_assoc;
end;
$$;

comment on function public.attach_directory_to_map(text, text) is
  'DIR-E4-S2: makes p_map_id read its pins live from p_directory_id (public_directory_entries) instead of its own listings. Upserts on map_id, so re-calling with a different directory switches the datasource. Raises if the map and directory belong to different clients.';

create or replace function public.detach_directory_from_map(p_map_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_map_client text;
begin
  select client_id into v_map_client from public.maps where id = p_map_id;
  if not found then
    raise exception 'Map not found';
  end if;

  if not (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
    or exists (select 1 from public.contacts where user_id = auth.uid() and client_id = v_map_client)
  ) then
    raise exception 'Access denied';
  end if;

  delete from public.directory_map_associations where map_id = p_map_id;
end;
$$;

comment on function public.detach_directory_from_map(text) is
  'Reverts a map to self-authored mode (Manual entry / Upload CSV / Sync data tabs re-enable). Does not touch the map''s listings/groups rows either way.';

revoke all on function public.attach_directory_to_map(text, text) from public;
revoke all on function public.detach_directory_from_map(text) from public;

grant execute on function public.attach_directory_to_map(text, text) to authenticated;
grant execute on function public.detach_directory_from_map(text) to authenticated;

-- 3) public_directory_entries — live read, not a publication snapshot.

create or replace view public.public_directory_entries as
  select e.*
  from public.directory_entries e
  join public.directories d on d.id = e.directory_id
  where e.is_active = true
    and d.current_publication_id is not null;

comment on view public.public_directory_entries is
  'DIR-E4 / peer of public_listings. Live read of directory_entries (not a publication snapshot — matches how public_listings reads listings live regardless of map publication version, per 20260827120000''s precedent). Only rows for directories that have been published at least once are visible, so an unpublished directory-sourced map renders the DIR-E4-S2 empty state rather than leaking draft data.';

-- 4) anon read access — deliberately deferred by 20260714120000, needed now
--    for a directory-sourced map's public embed and the directory's own
--    public pages (Ethical Elephant Directory design: homepage map,
--    filtering/results, standalone map embed, listing mini-map).

create policy "directories_anon_select"
  on public.directories for select
  to anon
  using (current_publication_id is not null);

create policy "directory_entries_anon_select"
  on public.directory_entries for select
  to anon
  using (
    is_active = true
    and exists (
      select 1 from public.directories d
      where d.id = directory_entries.directory_id
        and d.current_publication_id is not null
    )
  );

grant select on table public.directories to anon;
grant select on table public.directory_entries to anon;
grant select on table public.public_directory_entries to anon, authenticated, service_role;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_map_associations') then
    raise exception 'VERIFY FAILED: directory_map_associations was not created';
  end if;
  if not exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'public_directory_entries') then
    raise exception 'VERIFY FAILED: public_directory_entries was not created';
  end if;
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'attach_directory_to_map') then
    raise exception 'VERIFY FAILED: attach_directory_to_map() was not created';
  end if;
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'detach_directory_from_map') then
    raise exception 'VERIFY FAILED: detach_directory_from_map() was not created';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'directories' and policyname = 'directories_anon_select') then
    raise exception 'VERIFY FAILED: directories_anon_select policy was not created';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'directory_entries' and policyname = 'directory_entries_anon_select') then
    raise exception 'VERIFY FAILED: directory_entries_anon_select policy was not created';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

-- Row counts — must be UNCHANGED from the pre-migration output (additive only)
select
  'maps' as tbl, count(*) as rows from public.maps                    union all
  select 'listings', count(*) from public.listings                    union all
  select 'directories', count(*) from public.directories               union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;

-- RLS still enabled on every touched table
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('maps', 'directories', 'directory_entries', 'directory_map_associations')
order by tablename;
-- All rows must show rowsecurity = true

-- Orphan checks — must all return 0
select 'orphaned_directory_map_associations_map' as check_name, count(*) from public.directory_map_associations x
where not exists (select 1 from public.maps m where m.id = x.map_id)
union all
select 'orphaned_directory_map_associations_directory', count(*) from public.directory_map_associations x
where not exists (select 1 from public.directories d where d.id = x.directory_id)
union all
select 'cross_client_directory_map_associations', count(*) from public.directory_map_associations x
join public.maps m on m.id = x.map_id
join public.directories d on d.id = x.directory_id
where m.client_id <> d.client_id;
