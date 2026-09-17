-- ============================================================
-- Rollback: 20260917140000_group_migration_tooling
-- Reverses: creation of dry_run_group_migration, migrate_map_groups_to_category,
--           verify_group_migration
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'migrate_map_groups_to_category') then
    raise exception 'ABORT: migrate_map_groups_to_category does not exist — nothing to roll back';
  end if;

  -- Safety: refuse if any map has actually been migrated using this
  -- tooling — dropping the functions would leave that map's data
  -- (the 'group_migrated' field, its options, and the pointed-at
  -- color_filter_field_id) orphaned from any way to inspect/verify it
  -- through these functions. The migrated data itself is untouched by
  -- this rollback either way (these functions never drop map_filter_fields
  -- rows), but confirm intentionally before removing the tooling that
  -- reasons about it.
  if exists (select 1 from public.map_filter_fields where key = 'group_migrated') then
    raise exception 'ABORT: at least one map has already been migrated via migrate_map_groups_to_category (a map_filter_fields row with key=group_migrated exists). Rolling back the tooling now would remove verify_group_migration for it. Confirm this is intended before overriding.';
  end if;
end $$;

-- THE ROLLBACK
drop function if exists public.dry_run_group_migration(text);
drop function if exists public.migrate_map_groups_to_category(text);
drop function if exists public.verify_group_migration(text);

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (select 1 from pg_proc where proname in ('dry_run_group_migration', 'migrate_map_groups_to_category', 'verify_group_migration')) then
    raise exception 'ROLLBACK VERIFY FAILED: at least one group-migration-tooling function still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: group migration tooling functions removed';
end $$;

-- Row counts — must be unchanged (rollback only drops functions, touches no data).
select
  'maps'               as tbl, count(*) as rows from public.maps               union all
  select 'groups',                  count(*) from public.groups                 union all
  select 'listings',                count(*) from public.listings               union all
  select 'map_filter_fields',       count(*) from public.map_filter_fields
order by tbl;
