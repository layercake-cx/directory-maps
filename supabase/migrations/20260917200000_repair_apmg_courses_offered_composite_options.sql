-- ============================================================
-- Migration: 20260917200000_repair_apmg_courses_offered_composite_options
-- Description: DATA REPAIR. Runs split_all_composite_options_for_field()
--              for real against APMG's live "Courses Offered" field
--              (map 275d7e76-bc3a-4535-ad48-f824d7651119,
--              "APMG_ Sample_Demo", client
--              a011ee30-a532-4f17-bc2b-8bb36b4c86c6; field id
--              f990d4a6-842d-444d-b6a5-192396bf1f6f), after reviewing the
--              dry run (20260917190000_dry_run_apmg_courses_offered_split)
--              and getting the user's explicit go-ahead. See
--              /Users/damianwatson/.claude/plans/abstract-bubbling-bird.md
--              for the full background — this field had 12 options whose
--              labels were several course names joined by ", " into one
--              literal option instead of being split, because this
--              field's import path only ever split multi-value cells on
--              `|`.
--
--              This repairs the 12 composite options: splits each label,
--              finds-or-creates a matching atomic option per piece
--              (reusing 11 pieces that already existed as atomic options
--              elsewhere on the field), re-tags the 12 affected listings
--              with the full atomic set, then removes the now-unused
--              composite options. Guarded so this is a safe no-op on any
--              environment that doesn't have this map/field (e.g.
--              staging, where this is real client data that was never
--              seeded).
-- Affected tables: map_filter_field_options, listing_filter_values
--                  (production only, this one field); also creates two
--                  backup tables of this field's pre-repair state
--                  (map_filter_field_options_backup_20260917_apmg_courses,
--                  listing_filter_values_backup_20260917_apmg_courses),
--                  RLS-locked immediately, per this repo's "back up
--                  before a destructive op" policy.
-- Rollback: _20260917200000_repair_apmg_courses_offered_composite_options.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-17
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- This is itself the "real run" following an already-reviewed dry run
-- (20260917190000) and explicit user sign-off. Apply directly to
-- PRODUCTION (gxixwdjfmegxcxfeflro) — this map/field does not exist on
-- staging.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
declare
  v_field_exists boolean;
begin
  select exists (select 1 from public.map_filter_fields where id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f') into v_field_exists;
  if not v_field_exists then
    raise notice 'Field f990d4a6-842d-444d-b6a5-192396bf1f6f does not exist on this environment — skipping (expected on non-production environments).';
  end if;
end $$;

-- Row counts — inspect before proceeding (production only; harmless
-- empty results elsewhere).
select count(*) as options_before
from public.map_filter_field_options where field_id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f';
select count(*) as listing_tags_before
from public.listing_filter_values where field_id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f';


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- Back up this field's full pre-repair state first (composite options,
-- any already-existing atomic options, and every listing tag), per this
-- repo's "back up before a destructive op" policy — the repair function
-- deletes the 12 composite options and their tags as part of its normal
-- operation. Restoring these two backup tables is exactly how the
-- rollback file undoes this migration.
do $$
begin
  if exists (select 1 from public.map_filter_fields where id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f') then
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'map_filter_field_options_backup_20260917_apmg_courses') then
      create table public.map_filter_field_options_backup_20260917_apmg_courses as
        select * from public.map_filter_field_options where field_id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f';
      comment on table public.map_filter_field_options_backup_20260917_apmg_courses is
        'Pre-repair backup of Courses Offered options (field f990d4a6-842d-444d-b6a5-192396bf1f6f), taken by 20260917200000 immediately before split_all_composite_options_for_field. Not read by any application code — safe to drop once the repair is confirmed and no longer needs rolling back.';
    end if;
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_filter_values_backup_20260917_apmg_courses') then
      create table public.listing_filter_values_backup_20260917_apmg_courses as
        select * from public.listing_filter_values where field_id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f';
      comment on table public.listing_filter_values_backup_20260917_apmg_courses is
        'Pre-repair backup of Courses Offered listing tags (field f990d4a6-842d-444d-b6a5-192396bf1f6f), taken by 20260917200000 immediately before split_all_composite_options_for_field. Not read by any application code — safe to drop once the repair is confirmed and no longer needs rolling back.';
    end if;
    -- These backup tables hold no PII beyond what listing_filter_values/
    -- map_filter_field_options already do (option labels, ids) — RLS
    -- locked down immediately regardless, matching the
    -- listing_research_backup_20260906 fix from earlier today (that gap
    -- came from forgetting this exact step).
    execute 'alter table public.map_filter_field_options_backup_20260917_apmg_courses enable row level security';
    execute 'alter table public.listing_filter_values_backup_20260917_apmg_courses enable row level security';
  end if;
end $$;

do $$
declare
  v_result jsonb;
  v_verify jsonb;
begin
  if not exists (select 1 from public.map_filter_fields where id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f') then
    return;
  end if;

  v_result := public.split_all_composite_options_for_field('f990d4a6-842d-444d-b6a5-192396bf1f6f');
  raise notice 'split_all_composite_options_for_field result: %', v_result;

  v_verify := public.verify_field_has_no_composite_options('f990d4a6-842d-444d-b6a5-192396bf1f6f');
  raise notice 'verify_field_has_no_composite_options result: %', v_verify;

  if not (v_verify->>'clean')::boolean then
    raise exception 'VERIFY FAILED: composite options remain after split_all_composite_options_for_field: %', v_verify;
  end if;

  raise notice 'VERIFY PASSED: no composite options remain on Courses Offered';
end $$;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

-- Row counts — options should have grown (composites replaced by more
-- atomic pieces, minus reused matches); listing tags should have grown
-- (each of the 12 affected listings now carries several atomic tags
-- instead of one composite tag).
select count(*) as options_after
from public.map_filter_field_options where field_id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f';
select count(*) as listing_tags_after
from public.listing_filter_values where field_id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f';

-- No option label on this field should contain the delimiter anymore.
select count(*) as remaining_composite_options
from public.map_filter_field_options
where field_id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f' and position(', ' in label) > 0;
-- Expected: 0
