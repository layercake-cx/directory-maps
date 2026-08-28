-- ============================================================
-- Migration: 20260827160000_create_directory_from_map
-- Description: The actual "build a directory from this map's data" feature
--              requested this session — a one-shot copy of a map's groups
--              and listings into a brand-new directory, so a client doesn't
--              have to re-enter everything by hand to try DIR-E4. This is
--              the second slice of the "Unify Map & Directory Data Model"
--              epic (Monday item 3189433497), pilot target: UK Associations
--              Sample.
--
--              Deliberately scoped to creation + copy only:
--                - Does NOT publish the new directory (publish_directory
--                  needs a full config snapshot built the same way the
--                  directory dashboard already builds one — reusing that
--                  client-side logic is safer than guessing its shape here).
--                - Does NOT attach the map to the new directory (the
--                  attach_directory_to_map() RPC from 20260827150000 already
--                  does this, and needs the directory published first for
--                  the map to show anything anyway).
--                - Does NOT touch or delete the source map's listings/groups
--                  — this is a copy, not a move. Per this session's
--                  discussion, a map only reaches "single copy of data,
--                  ever" after a manual, explicitly-reviewed parity check
--                  and its own separate destructive migration — never as a
--                  side effect of this step.
--              The frontend wires these three steps (create -> publish ->
--              attach) as separate, visible actions so a client always sees
--              and can review the new directory before it goes live on the
--              map.
-- Affected tables: directories, directory_groups, directory_entries (new
--                   rows only, via create_directory_from_map()).
--                   directory_entries.source check constraint (adds
--                   'map_import' as an allowed value).
-- Rollback: _20260827160000_create_directory_from_map.rollback.sql
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directories') then
    raise exception 'ABORT: table public.directories does not exist';
  end if;
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'slugify_text') then
    raise exception 'ABORT: public.slugify_text() does not exist';
  end if;
  if exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'create_directory_from_map') then
    raise exception 'ABORT: create_directory_from_map() already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding
select
  'maps' as tbl, count(*) as rows from public.maps                    union all
  select 'listings', count(*) from public.listings                    union all
  select 'groups', count(*) from public.groups                        union all
  select 'directories', count(*) from public.directories               union all
  select 'directory_entries', count(*) from public.directory_entries   union all
  select 'directory_groups', count(*) from public.directory_groups
order by tbl;
-- Save this output. directories/directory_entries/directory_groups counts
-- may legitimately grow after this migration is USED (it's an RPC, not a
-- one-time backfill) — this is the baseline for that, not an equality check.


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1) Allow entries created by this RPC to be distinguished from hand-typed
--    ('manual'), CSV-imported ('csv'), or Sheets-synced ('integration')
--    entries.

alter table public.directory_entries drop constraint directory_entries_source_check;
alter table public.directory_entries add constraint directory_entries_source_check
  check (source in ('manual', 'csv', 'integration', 'map_import'));

-- 2) create_directory_from_map() — security definer, mirrors the
--    permission check used by directory creation today (Owner/Manager or
--    platform admin only — Members cannot create directories, per
--    docs/DIRECTORIES.md DIR-E1-S1).

create or replace function public.create_directory_from_map(
  p_map_id text,
  p_name text default null,
  p_slug text default null
)
returns public.directories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_map           public.maps%rowtype;
  v_dir           public.directories%rowtype;
  v_dir_id        text := gen_random_uuid()::text;
  v_name          text;
  v_slug          text;
  v_candidate     text;
  v_suffix        integer := 1;
  v_group_map     jsonb := '{}'::jsonb; -- old groups.id (uuid, as text) -> new directory_groups.id (uuid, as text)
  v_new_group_id  uuid;
  r               record;
begin
  select * into v_map from public.maps where id = p_map_id;
  if not found then
    raise exception 'Map not found';
  end if;

  if not (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
    or exists (
      select 1 from public.contacts
      where user_id = auth.uid() and client_id = v_map.client_id and role in ('owner', 'manager')
    )
  ) then
    raise exception 'Access denied';
  end if;

  v_name := coalesce(nullif(trim(p_name), ''), v_map.name);
  v_candidate := coalesce(nullif(trim(p_slug), ''), public.slugify_text(v_name), 'directory');

  while exists (select 1 from public.directories where client_id = v_map.client_id and slug = v_candidate) loop
    v_suffix := v_suffix + 1;
    v_candidate := coalesce(nullif(trim(p_slug), ''), public.slugify_text(v_name), 'directory') || '-' || v_suffix;
  end loop;
  v_slug := v_candidate;

  insert into public.directories (id, client_id, name, slug, description, is_active)
  values (v_dir_id, v_map.client_id, v_name, v_slug, null, true)
  returning * into v_dir;

  for r in select * from public.groups where map_id = p_map_id loop
    v_new_group_id := gen_random_uuid();
    insert into public.directory_groups (id, directory_id, name, sort_order, color)
    values (v_new_group_id, v_dir_id, r.name, r.sort_order, r.color);
    v_group_map := v_group_map || jsonb_build_object(r.id::text, v_new_group_id::text);
  end loop;

  for r in select * from public.listings where map_id = p_map_id loop
    insert into public.directory_entries (
      id, directory_id, directory_group_id, name, address, postcode, country, city,
      lat, lng, is_active, website_url, email, phone, logo_url, notes_html, allow_html,
      geocode_status, source
    ) values (
      gen_random_uuid()::text, v_dir_id,
      case when r.group_id is not null then (v_group_map ->> r.group_id::text)::uuid else null end,
      r.name, r.address, r.postcode, r.country, r.city,
      r.lat, r.lng, r.is_active, r.website_url, r.email, r.phone, r.logo_url, r.notes_html, r.allow_html,
      r.geocode_status, 'map_import'
    );
  end loop;

  return v_dir;
end;
$$;

comment on function public.create_directory_from_map(text, text, text) is
  'Copies a map''s groups and listings into a brand-new directory (source = ''map_import'' on the copied entries). Does not publish the directory or attach it back to the map as a datasource — those are separate, visible steps (publish_directory, attach_directory_to_map). Does not touch or delete the source map''s own listings/groups.';

revoke all on function public.create_directory_from_map(text, text, text) from public;
grant execute on function public.create_directory_from_map(text, text, text) to authenticated;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'create_directory_from_map') then
    raise exception 'VERIFY FAILED: create_directory_from_map() was not created';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'directory_entries_source_check'
      and pg_get_constraintdef(oid) like '%map_import%'
  ) then
    raise exception 'VERIFY FAILED: directory_entries_source_check does not allow ''map_import''';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

-- Row counts — maps/listings/groups must be UNCHANGED (this migration only
-- adds a callable function + widens a check constraint; it does not itself
-- write any rows)
select
  'maps' as tbl, count(*) as rows from public.maps                    union all
  select 'listings', count(*) from public.listings                    union all
  select 'groups', count(*) from public.groups                        union all
  select 'directories', count(*) from public.directories               union all
  select 'directory_entries', count(*) from public.directory_entries   union all
  select 'directory_groups', count(*) from public.directory_groups
order by tbl;
