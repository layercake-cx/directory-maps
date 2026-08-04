-- ============================================================
-- Rollback: 20260716120000_create_directory_map_associations
-- Reverses: drops directory_map_associations (and its RLS policies,
--           which are dropped automatically with the table).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  -- 1. Confirm there is something to roll back
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directory_map_associations'
  ) then
    raise exception 'ABORT: nothing to roll back — public.directory_map_associations does not exist';
  end if;

  -- 2. Data-loss guard — abort if any real content has been created since the migration ran
  if exists (select 1 from public.directory_map_associations limit 1) then
    raise exception
      'ABORT: live data exists in public.directory_map_associations. Export it before rolling back. '
      'To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop table if exists public.directory_map_associations;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'directory_map_associations'
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: directory_map_associations still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — confirm no data loss beyond what was expected
select
  'clients'      as tbl, count(*) as rows from public.clients     union all
  select 'directories',   count(*) from public.directories        union all
  select 'maps',          count(*) from public.maps
order by tbl;
