-- ============================================================
-- Rollback: 20260917200000_repair_apmg_courses_offered_composite_options
-- Reverses: split_all_composite_options_for_field('f990d4a6-842d-444d-
--           b6a5-192396bf1f6f') on APMG's "Courses Offered" field, by
--           restoring the exact pre-repair snapshot taken by the forward
--           migration.
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'map_filter_field_options_backup_20260917_apmg_courses') then
    raise exception 'ABORT: backup table map_filter_field_options_backup_20260917_apmg_courses does not exist — nothing to restore from (this environment may never have had the field, or the backup was already cleaned up)';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_filter_values_backup_20260917_apmg_courses') then
    raise exception 'ABORT: backup table listing_filter_values_backup_20260917_apmg_courses does not exist — nothing to restore from';
  end if;
end $$;

-- Row counts before rollback — inspect.
select count(*) as options_before_rollback
from public.map_filter_field_options where field_id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f';
select count(*) as listing_tags_before_rollback
from public.listing_filter_values where field_id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f';

-- Restore: delete the field's current tags and options, reinsert exactly
-- what was backed up (tags first is wrong — options must exist before
-- tags can reference them — so delete tags, delete options, reinsert
-- options, reinsert tags).
delete from public.listing_filter_values where field_id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f';
delete from public.map_filter_field_options where field_id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f';

insert into public.map_filter_field_options
select * from public.map_filter_field_options_backup_20260917_apmg_courses;

insert into public.listing_filter_values
select * from public.listing_filter_values_backup_20260917_apmg_courses;

do $$
declare
  v_options_now integer;
  v_options_backup integer;
begin
  select count(*) into v_options_now from public.map_filter_field_options where field_id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f';
  select count(*) into v_options_backup from public.map_filter_field_options_backup_20260917_apmg_courses;
  if v_options_now <> v_options_backup then
    raise exception 'ROLLBACK VERIFY FAILED: option count after restore (%) does not match backup (%)', v_options_now, v_options_backup;
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: Courses Offered restored to its pre-repair state (% options)', v_options_now;
end $$;

-- Row counts after rollback — must match the backup tables exactly.
select count(*) as options_after_rollback
from public.map_filter_field_options where field_id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f';
select count(*) as listing_tags_after_rollback
from public.listing_filter_values where field_id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f';

-- Backup tables are left in place after rollback (not dropped) —
-- harmless, RLS-locked, and a second safety net until someone
-- deliberately cleans them up.
