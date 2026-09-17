-- ============================================================
-- Rollback: 20260917160000_revoke_public_execute_on_migration_tooling
-- Reverses: REVOKE EXECUTE ... FROM PUBLIC on the migration-tooling functions
-- ============================================================
--
-- Re-granting PUBLIC execute on these functions re-opens the security gap
-- this migration closed. Only run this rollback if you are certain that is
-- intended (it is not expected to ever be needed in practice).

do $$
begin
  if exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'migrate_map_groups_to_category'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    raise exception 'ABORT: PUBLIC/anon/authenticated already has execute on migrate_map_groups_to_category — nothing to roll back, or already rolled back';
  end if;
end $$;

grant execute on function public.dry_run_group_migration(text) to public, anon, authenticated;
grant execute on function public.migrate_map_groups_to_category(text) to public, anon, authenticated;
grant execute on function public.verify_group_migration(text) to public, anon, authenticated;
grant execute on function public.dry_run_split_composite_options(uuid, text) to public, anon, authenticated;
grant execute on function public.split_composite_filter_option(uuid, text) to public, anon, authenticated;
grant execute on function public.split_all_composite_options_for_field(uuid, text) to public, anon, authenticated;
grant execute on function public.verify_field_has_no_composite_options(uuid, text) to public, anon, authenticated;
grant execute on function public._slugify_option_value(uuid, text) to public, anon, authenticated;

do $$
begin
  raise notice 'ROLLBACK APPLIED: PUBLIC execute re-granted on migration-tooling functions (this re-opens the security gap — confirm this was truly intended)';
end $$;
