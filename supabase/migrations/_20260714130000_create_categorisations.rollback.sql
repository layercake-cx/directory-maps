-- ============================================================
-- Rollback: 20260714130000_create_categorisations
-- Reverses: drops categorisations, category_terms,
--           directory_category_terms, entry_category_terms (and their
--           RLS policies, dropped automatically with the tables).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  -- 1. Confirm there is something to roll back
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'categorisations'
  ) then
    raise exception 'ABORT: nothing to roll back — public.categorisations does not exist';
  end if;

  -- 2. Data-loss guard — abort if any real content has been created since the migration ran
  if exists (select 1 from public.categorisations limit 1) then
    raise exception
      'ABORT: live data exists in public.categorisations. Export it before rolling back. '
      'To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop table if exists public.entry_category_terms;
drop table if exists public.directory_category_terms;
drop table if exists public.category_terms;
drop table if exists public.categorisations;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('categorisations', 'category_terms', 'directory_category_terms', 'entry_category_terms')
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: one or more categorisation tables still exist';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — confirm no data loss beyond what was expected
select
  'clients'            as tbl, count(*) as rows from public.clients            union all
  select 'directories',        count(*) from public.directories                union all
  select 'directory_entries',  count(*) from public.directory_entries
order by tbl;
