-- ============================================================
-- Migration: 20261117150000_archive_and_restore
-- Description: Archive / Restore for customers, maps and directories.
--              Adds is_active / archived_at / archived_by (directories already
--              have is_active), liveness helpers, and makes every public (anon)
--              read path and the customer lock-out honour them. Nothing is deleted.
-- Affected tables: clients, maps, directories (columns); RLS policies on
--              maps, groups, listings, map_publications, directories,
--              directory_entries, "Clients manage their own maps"
-- Affected functions: current_user_client_id (archived customer => null),
--              resolve_custom_domain (adds is_live), new: is_entity_live,
--              entity_status, entity_status_by_slug, my_client_is_archived
-- Rollback: _20261117150000_archive_and_restore.rollback.sql
-- Author: Claude Code
-- Date: 2026-11-17
--
-- Effective liveness = the item is active AND its customer is active. A customer's
-- archive is NOT cascaded onto its maps/directories, so items archived separately
-- stay archived when the customer is restored.
--
-- DRY RUN: this file runs as one transaction and ends with a VERIFY block that raises
-- on any problem, so a failed apply rolls back completely. To dry-run by hand in the
-- SQL editor, wrap the whole file in BEGIN; ... ROLLBACK;
-- ============================================================

-- PRE-MIGRATION INTEGRITY CHECK
do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'maps') then
    raise exception 'ABORT: public.maps does not exist';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'maps' and column_name = 'is_active') then
    raise exception 'ABORT: maps.is_active already exists — migration may have already run';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'clients' and column_name = 'is_active') then
    raise exception 'ABORT: clients.is_active already exists — migration may have already run';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'is_active') then
    raise exception 'ABORT: directories.is_active is expected to exist already';
  end if;
  if not exists (select 1 from pg_proc where proname = 'current_user_client_id') then
    raise exception 'ABORT: public.current_user_client_id() does not exist';
  end if;
  if not exists (select 1 from pg_proc where proname = 'resolve_custom_domain') then
    raise exception 'ABORT: public.resolve_custom_domain() does not exist';
  end if;
end $$;

-- CAPTURE PRE-STATE (inspect; compare with the post-migration counts)
select 'clients' as tbl, count(*) as rows from public.clients union all
select 'maps', count(*) from public.maps union all
select 'listings', count(*) from public.listings union all
select 'directories', count(*) from public.directories union all
select 'directory_entries', count(*) from public.directory_entries
order by tbl;

-- ============================================================
-- THE MIGRATION
-- ============================================================

-- 1) Columns. Defaults mean every existing row is active; no backfill. Directories that are
--    already is_active = false keep archived_at null (the UI shows "Archived" without a date).
alter table public.maps
  add column is_active boolean not null default true,
  add column archived_at timestamptz null,
  add column archived_by uuid null references auth.users(id) on delete set null;

alter table public.clients
  add column is_active boolean not null default true,
  add column archived_at timestamptz null,
  add column archived_by uuid null references auth.users(id) on delete set null;

alter table public.directories
  add column archived_at timestamptz null,
  add column archived_by uuid null references auth.users(id) on delete set null;

comment on column public.maps.is_active is 'false = archived: offline to visitors, read-only in the app. Restore sets it back to true.';
comment on column public.clients.is_active is 'false = archived customer: its users are locked out and every map/directory is offline. Restore sets it back to true.';

-- 2) Liveness helpers. Security definer so RLS policies can call them without recursing into the
--    tables they protect; they expose only a boolean / status word.
create or replace function public.is_entity_live(p_entity_type text, p_entity_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    case p_entity_type
      when 'map' then (
        select m.is_active and c.is_active
        from public.maps m join public.clients c on c.id = m.client_id
        where m.id = p_entity_id)
      when 'directory' then (
        select d.is_active and c.is_active
        from public.directories d join public.clients c on c.id = d.client_id
        where d.id = p_entity_id)
      when 'client' then (select c.is_active from public.clients c where c.id = p_entity_id)
    end,
    false);
$$;

-- 'live' | 'archived' | 'missing' — lets a public page tell "taken down" from "never existed".
create or replace function public.entity_status(p_entity_type text, p_entity_id text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when p_entity_type = 'map' and exists (select 1 from public.maps where id = p_entity_id) then
      case when public.is_entity_live('map', p_entity_id) then 'live' else 'archived' end
    when p_entity_type = 'directory' and exists (select 1 from public.directories where id = p_entity_id) then
      case when public.is_entity_live('directory', p_entity_id) then 'live' else 'archived' end
    when p_entity_type = 'client' and exists (select 1 from public.clients where id = p_entity_id) then
      case when public.is_entity_live('client', p_entity_id) then 'live' else 'archived' end
    else 'missing'
  end;
$$;

create or replace function public.entity_status_by_slug(p_entity_type text, p_client_slug text, p_entity_slug text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select public.entity_status('map', m.id)
       from public.maps m join public.clients c on c.id = m.client_id
      where p_entity_type = 'map' and c.slug = p_client_slug and m.slug = p_entity_slug
      limit 1),
    (select public.entity_status('directory', d.id)
       from public.directories d join public.clients c on c.id = d.client_id
      where p_entity_type = 'directory' and c.slug = p_client_slug and d.slug = p_entity_slug
      limit 1),
    'missing');
$$;

-- True when the signed-in user belongs to an archived customer (ClientGate signs them out).
create or replace function public.my_client_is_archived()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.contacts ct join public.clients c on c.id = ct.client_id
    where ct.user_id = auth.uid() and c.is_active = false);
$$;

revoke all on function public.is_entity_live(text, text) from public;
revoke all on function public.entity_status(text, text) from public;
revoke all on function public.entity_status_by_slug(text, text, text) from public;
revoke all on function public.my_client_is_archived() from public;
grant execute on function public.is_entity_live(text, text) to anon, authenticated, service_role;
grant execute on function public.entity_status(text, text) to anon, authenticated, service_role;
grant execute on function public.entity_status_by_slug(text, text, text) to anon, authenticated, service_role;
grant execute on function public.my_client_is_archived() to authenticated;

-- 3) Customer lock-out: an archived customer's users resolve to no client, so every
--    *_own_client / clients_own_* policy returns no rows. Staff use is_admin() policies and are unaffected.
create or replace function public.current_user_client_id()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select ct.client_id
  from public.contacts ct join public.clients c on c.id = ct.client_id
  where ct.user_id = auth.uid() and c.is_active
  limit 1;
$$;

drop policy if exists "Clients manage their own maps" on public.maps;
create policy "Clients manage their own maps"
  on public.maps for all to authenticated
  using (client_id in (select contacts.client_id from public.contacts where contacts.user_id = auth.uid())
         and public.is_entity_live('client', client_id))
  with check (client_id in (select contacts.client_id from public.contacts where contacts.user_id = auth.uid())
         and public.is_entity_live('client', client_id));

-- 4) Public (anon) read paths exclude anything not live.
drop policy if exists maps_anon_select on public.maps;
create policy maps_anon_select on public.maps for select to anon
  using (public.is_entity_live('map', id));

drop policy if exists groups_anon_select on public.groups;
create policy groups_anon_select on public.groups for select to anon
  using (public.is_entity_live('map', map_id));

drop policy if exists listings_anon_select on public.listings;
create policy listings_anon_select on public.listings for select to anon
  using (public.is_entity_live('map', map_id));

drop policy if exists map_publications_select_current_for_map on public.map_publications;
create policy map_publications_select_current_for_map on public.map_publications for select to anon, authenticated
  using (exists (
    select 1 from public.maps m
    where m.id = map_publications.map_id
      and m.current_publication_id = map_publications.id
      and public.is_entity_live('map', m.id)));

drop policy if exists directories_anon_select on public.directories;
create policy directories_anon_select on public.directories for select to anon
  using (current_publication_id is not null and public.is_entity_live('directory', id));

drop policy if exists directory_entries_anon_select on public.directory_entries;
create policy directory_entries_anon_select on public.directory_entries for select to anon
  using (is_active = true
         and public.is_entity_live('directory', directory_id)
         and exists (select 1 from public.directories d
                     where d.id = directory_entries.directory_id and d.current_publication_id is not null));

-- 5) Custom-domain resolver gains is_live so the edge middleware needs a single RPC call.
--    Drop first: CREATE OR REPLACE cannot change a return type.
drop function if exists public.resolve_custom_domain(text);

create function public.resolve_custom_domain(p_hostname text)
returns table(entity_type text, client_slug text, entity_slug text, status text, is_live boolean)
language sql
security definer
stable
set search_path = public
as $$
  select 'map'::text, c.slug, m.slug, cd.status, (m.is_active and c.is_active)
  from public.client_domains cd
  join public.clients c on c.id = cd.client_id
  join public.maps m on m.id = cd.map_id
  where cd.map_id is not null
    and lower(cd.hostname) = lower(p_hostname)
  union all
  select 'directory'::text, c.slug, d.slug, cd.status, (d.is_active and c.is_active)
  from public.client_domains cd
  join public.clients c on c.id = cd.client_id
  join public.directories d on d.id = cd.directory_id
  where cd.directory_id is not null
    and lower(cd.hostname) = lower(p_hostname)
  limit 1;
$$;

comment on function public.resolve_custom_domain(text) is
  'Resolves a hostname to the client + (map or directory) it publishes, for Vercel Edge Middleware. Returns status regardless of value and is_live (item active AND customer active) so the caller can serve a 410 for archived items in one round trip. Security definer; exposes only entity_type/slugs/status/is_live.';

revoke all on function public.resolve_custom_domain(text) from public;
grant execute on function public.resolve_custom_domain(text) to anon, authenticated, service_role;

-- ============================================================
-- POST-MIGRATION VERIFICATION (raises => whole migration rolls back)
-- ============================================================
do $$
begin
  if (select count(*) from public.maps where not is_active) <> 0
     or (select count(*) from public.clients where not is_active) <> 0 then
    raise exception 'VERIFY FAILED: new is_active columns should default every existing row to active';
  end if;
  if exists (select 1 from public.maps m where not public.is_entity_live('map', m.id)) then
    raise exception 'VERIFY FAILED: an existing map is not live straight after migration';
  end if;
  if public.entity_status('map', '__no_such_id__') <> 'missing' then
    raise exception 'VERIFY FAILED: entity_status should report missing ids';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maps' and policyname = 'maps_anon_select' and qual like '%is_entity_live%') then
    raise exception 'VERIFY FAILED: maps_anon_select was not replaced';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'resolve_custom_domain' ) and
     not exists (select 1 from pg_proc where proname = 'resolve_custom_domain') then
    raise exception 'VERIFY FAILED: resolve_custom_domain missing';
  end if;
  raise notice 'VERIFY PASSED: archive columns, helpers, policies and resolver in place';
end $$;

-- Row counts must match the pre-state exactly.
select 'clients' as tbl, count(*) as rows from public.clients union all
select 'maps', count(*) from public.maps union all
select 'listings', count(*) from public.listings union all
select 'directories', count(*) from public.directories union all
select 'directory_entries', count(*) from public.directory_entries
order by tbl;
