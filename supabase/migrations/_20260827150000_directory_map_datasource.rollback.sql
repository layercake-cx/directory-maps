-- ============================================================
-- Rollback: 20260827150000_directory_map_datasource
-- Reverses: directory_map_associations table + RLS, attach_directory_to_map()
--           / detach_directory_from_map() RPCs, public_directory_entries
--           view, and the new anon-select policies + grants on
--           directories/directory_entries. Does not touch maps, listings,
--           groups, directories, or directory_entries data — this
--           migration was additive only.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
declare
  n bigint;
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_map_associations') then
    raise notice 'directory_map_associations already absent — nothing to roll back';
    return;
  end if;

  select count(*) into n from public.directory_map_associations;
  if n > 0 then
    raise notice 'Rolling back with % live map<->directory association(s) — any map currently reading pins from a directory will revert to its own (unchanged) listings once this is dropped. Confirm this is intended before proceeding.', n;
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop policy if exists "directory_entries_anon_select" on public.directory_entries;
drop policy if exists "directories_anon_select" on public.directories;

revoke select on table public.directory_entries from anon;
revoke select on table public.directories from anon;

drop view if exists public.public_directory_entries;

drop function if exists public.detach_directory_from_map(text);
drop function if exists public.attach_directory_to_map(text, text);

drop table if exists public.directory_map_associations;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if to_regclass('public.directory_map_associations') is not null then
    raise exception 'ROLLBACK VERIFY FAILED: directory_map_associations still exists';
  end if;
  if to_regclass('public.public_directory_entries') is not null then
    raise exception 'ROLLBACK VERIFY FAILED: public_directory_entries still exists';
  end if;
  if exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'attach_directory_to_map') then
    raise exception 'ROLLBACK VERIFY FAILED: attach_directory_to_map() still exists';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'directories' and policyname = 'directories_anon_select') then
    raise exception 'ROLLBACK VERIFY FAILED: directories_anon_select policy still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — must match the pre-rollback-migration state; no data lost
select
  'maps' as tbl, count(*) as rows from public.maps                    union all
  select 'listings', count(*) from public.listings                    union all
  select 'directories', count(*) from public.directories               union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;
