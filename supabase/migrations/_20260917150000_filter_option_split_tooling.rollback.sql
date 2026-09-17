-- ============================================================
-- Rollback: 20260917150000_filter_option_split_tooling
-- Reverses: creation of dry_run_split_composite_options,
--           split_composite_filter_option,
--           split_all_composite_options_for_field,
--           verify_field_has_no_composite_options,
--           _slugify_option_value
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'split_composite_filter_option') then
    raise exception 'ABORT: split_composite_filter_option does not exist — nothing to roll back';
  end if;
end $$;

-- THE ROLLBACK
drop function if exists public.dry_run_split_composite_options(uuid, text);
drop function if exists public.split_composite_filter_option(uuid, text);
drop function if exists public.split_all_composite_options_for_field(uuid, text);
drop function if exists public.verify_field_has_no_composite_options(uuid, text);
drop function if exists public._slugify_option_value(uuid, text);

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname in (
      'dry_run_split_composite_options', 'split_composite_filter_option',
      'split_all_composite_options_for_field', 'verify_field_has_no_composite_options',
      '_slugify_option_value'
    )
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: at least one filter-option-split-tooling function still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: filter option split tooling functions removed';
end $$;

-- Row counts — must be unchanged (rollback only drops functions, touches no data).
select
  'map_filter_fields'        as tbl, count(*) as rows from public.map_filter_fields        union all
  select 'map_filter_field_options', count(*) from public.map_filter_field_options
order by tbl;
