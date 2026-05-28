-- ============================================================
-- Rollback: YYYYMMDDHHMMSS_short_description
-- Reverses: <describe what the forward migration did>
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  -- 1. Confirm there is something to roll back
  -- Example for a DROP COLUMN rollback:
  -- if not exists (
  --   select 1 from information_schema.columns
  --   where table_schema = 'public'
  --     and table_name = '<target_table>'
  --     and column_name = '<column>'
  -- ) then
  --   raise exception 'ABORT: nothing to roll back — column does not exist';
  -- end if;

  -- 2. Data-loss guard (uncomment if the rollback destroys data)
  -- if exists (select 1 from public.<table> where <column> is not null limit 1) then
  --   raise exception
  --     'ABORT: live data exists in <column>. Export it before rolling back. '
  --     'To override, remove this check and re-run.';
  -- end if;

  null; -- replace with your actual guards
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

-- <write the exact reverse of the forward migration here>


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  -- <assertions that confirm the rollback succeeded>
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — confirm no data loss beyond what was expected
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'groups',    count(*) from public.groups            union all
  select 'listings',  count(*) from public.listings
order by tbl;
