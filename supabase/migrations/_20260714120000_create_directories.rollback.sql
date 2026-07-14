-- ============================================================
-- Rollback: 20260714120000_create_directories
-- Reverses: drops directories, directory_groups, directory_entries,
--           and contact_directory_permissions (and their RLS policies,
--           which are dropped automatically with the tables).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  -- 1. Confirm there is something to roll back
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directories'
  ) then
    raise exception 'ABORT: nothing to roll back — public.directories does not exist';
  end if;

  -- 2. Data-loss guard — abort if any real content has been created since the migration ran
  if exists (select 1 from public.directories limit 1) then
    raise exception
      'ABORT: live data exists in public.directories. Export it before rolling back. '
      'To override, remove this check and re-run.';
  end if;
  if exists (select 1 from public.directory_entries limit 1) then
    raise exception
      'ABORT: live data exists in public.directory_entries. Export it before rolling back. '
      'To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop table if exists public.contact_directory_permissions;
drop table if exists public.directory_entries;
drop table if exists public.directory_groups;
drop table if exists public.directories;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('directories', 'directory_groups', 'directory_entries', 'contact_directory_permissions')
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: one or more directories tables still exist';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — confirm no data loss beyond what was expected
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'groups',    count(*) from public.groups            union all
  select 'listings',  count(*) from public.listings           union all
  select 'contacts',  count(*) from public.contacts
order by tbl;
