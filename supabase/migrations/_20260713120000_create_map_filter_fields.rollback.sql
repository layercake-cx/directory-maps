-- ============================================================
-- Rollback: 20260713120000_create_map_filter_fields
-- Reverses: drops the three configurable filter-field tables
--           (listing_filter_values, map_filter_field_options,
--            map_filter_fields) and their RLS policies.
-- ============================================================
--
-- WARNING: this destroys all filter-field definitions, options, and
-- per-listing tagged values. Export the three tables first if any
-- client has started using the feature.
--
--   BEGIN;
--   <paste the "THE ROLLBACK" body below here>
--   ROLLBACK;   -- dry-run
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  -- Confirm there is something to roll back
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'map_filter_fields'
  ) then
    raise exception 'ABORT: nothing to roll back — map_filter_fields does not exist';
  end if;

  -- Data-loss guard: refuse to drop if any listing values exist.
  -- Remove this guard (and re-run) only after exporting the data.
  if exists (select 1 from public.listing_filter_values limit 1) then
    raise exception
      'ABORT: live rows exist in listing_filter_values. Export the three filter tables before rolling back. To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK (reverse order of creation; cascades drop policies/indexes)
-- ------------------------------------------------------------

drop table if exists public.listing_filter_values;
drop table if exists public.map_filter_field_options;
drop table if exists public.map_filter_fields;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name in ('map_filter_fields', 'map_filter_field_options', 'listing_filter_values')
  ) then
    raise exception 'ROLLBACK VERIFY FAILED: one of the filter-field tables still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: filter field tables dropped';
end $$;

-- Row counts — core tables must be unchanged
select
  'clients'   as tbl, count(*) as rows from public.clients union all
  select 'maps',      count(*) from public.maps              union all
  select 'groups',    count(*) from public.groups            union all
  select 'listings',  count(*) from public.listings
order by tbl;
