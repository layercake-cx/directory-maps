-- ============================================================
-- Migration: 20260917190000_dry_run_apmg_courses_offered_split
-- Description: READ-ONLY. Runs dry_run_split_composite_options() against
--              the real "Courses Offered" field on map
--              275d7e76-bc3a-4535-ad48-f824d7651119 (APMG's
--              "APMG_ Sample_Demo" map, client
--              a011ee30-a532-4f17-bc2b-8bb36b4c86c6), field id
--              f990d4a6-842d-444d-b6a5-192396bf1f6f, per the plan at
--              /Users/damianwatson/.claude/plans/abstract-bubbling-bird.md
--              and the user's go-ahead to work on this specific map.
--              Zero side effects — this migration touches no data. Its
--              only purpose is to surface the real report for review
--              before split_all_composite_options_for_field() is ever
--              invoked for real, in a later, separate migration.
-- Affected: none (read-only)
-- Rollback: none needed (nothing to undo)
-- Author: Claude Code
-- Date: 2026-09-17
-- ============================================================

do $$
begin
  if not exists (select 1 from public.map_filter_fields where id = 'f990d4a6-842d-444d-b6a5-192396bf1f6f') then
    raise notice 'Field f990d4a6-842d-444d-b6a5-192396bf1f6f does not exist on this environment (expected on staging/other non-production environments — this map''s data is production-only real client data).';
  else
    raise notice 'dry_run_split_composite_options(Courses Offered): %', public.dry_run_split_composite_options('f990d4a6-842d-444d-b6a5-192396bf1f6f');
  end if;
end $$;
