-- ============================================================
-- Rollback: 20260827160000_create_directory_from_map
-- Reverses: create_directory_from_map() and the widened
--           directory_entries_source_check constraint. Does NOT delete any
--           directories/directory_groups/directory_entries rows this
--           function may already have created — those are real client data
--           by the time this rollback would run, and deleting them is a
--           separate, explicit decision (see the data-loss guard below).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
declare
  n bigint;
begin
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'create_directory_from_map') then
    raise notice 'create_directory_from_map already absent — nothing to roll back';
    return;
  end if;

  select count(*) into n from public.directory_entries where source = 'map_import';
  if n > 0 then
    raise notice 'Rolling back with % existing map_import-sourced entr(y/ies) — this rollback does NOT delete them, it only removes the ability to create MORE this way. Confirm this is intended.', n;
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop function if exists public.create_directory_from_map(text, text, text);

-- Only narrow the check constraint back if nothing actually depends on the
-- wider value — narrowing while 'map_import' rows exist would immediately
-- violate the constraint being re-added.
do $$
begin
  if exists (select 1 from public.directory_entries where source = 'map_import') then
    raise notice 'Skipping constraint narrowing: % row(s) still have source = ''map_import''. Reclassify or remove them first if you need the original 3-value constraint back.',
      (select count(*) from public.directory_entries where source = 'map_import');
  else
    alter table public.directory_entries drop constraint directory_entries_source_check;
    alter table public.directory_entries add constraint directory_entries_source_check
      check (source in ('manual', 'csv', 'integration'));
  end if;
end $$;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'create_directory_from_map') then
    raise exception 'ROLLBACK VERIFY FAILED: create_directory_from_map() still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

-- Row counts — confirm no data loss beyond what was expected
select
  'maps' as tbl, count(*) as rows from public.maps                    union all
  select 'listings', count(*) from public.listings                    union all
  select 'directories', count(*) from public.directories               union all
  select 'directory_entries', count(*) from public.directory_entries
order by tbl;
