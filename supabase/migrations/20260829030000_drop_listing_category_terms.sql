-- ============================================================
-- Migration: 20260829030000_drop_listing_category_terms
-- Description: Reverses 20260829020000_create_listing_category_terms.
--              That migration let a client-wide categorisation tag
--              self-authored map listings independent of any directory
--              relationship — on review this doesn't serve the actual goal
--              ("a map and a directory can be filtered by the same
--              categories", i.e. a directory-sourced map and its directory
--              sharing filters) and had no per-map scoping, meaning any
--              categorisation flagged applies_to_listings would silently
--              appear as a filter on every map a client owns. Removed
--              rather than left dormant, per direct instruction.
--              A forward migration (not editing/removing the original
--              files) per standard practice — 20260829020000 and its
--              rollback stay in history as the record of what was tried.
--              categorisations/category_terms/entry_category_terms/
--              directory_category_terms (and their anon-select policies
--              from 20260829010000) are untouched — the directory-sourced
--              map <-> directory shared-filter mechanism (EmbedMap.jsx's
--              loadCategorisationFiltersForEntries, generate_directory_site's
--              filter bar + postMessage bridge) depends only on those and
--              is unaffected by this rollback.
-- Affected tables: listing_category_terms (dropped), categorisations
--                   (drops applies_to_listings column only)
-- Rollback: _20260829030000_drop_listing_category_terms.rollback.sql
--           (re-creates listing_category_terms + applies_to_listings,
--           i.e. re-applies 20260829020000 — only needed if this reversal
--           itself needs reversing)
-- Author: Claude Code
-- Date: 2026-08-29
-- ============================================================
--
-- RUN ORDER: apply on STAGING (beqejxneehilplrtpntn) -> verify ->
-- production was never touched by 20260829020000, so there is nothing to
-- reverse there.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_category_terms') then
    raise exception 'ABORT: listing_category_terms does not exist — nothing to drop (already reverted?)';
  end if;
end $$;

-- Confirm no real data would be lost (feature was never used end-to-end;
-- expect 0, but verify rather than assume).
select 'listing_category_terms' as tbl, count(*) as rows from public.listing_category_terms;

select
  'categorisations'   as tbl, count(*) as rows from public.categorisations   union all
  select 'category_terms',    count(*) from public.category_terms           union all
  select 'listings',          count(*) from public.listings
order by tbl;
-- Save this output. Must be unchanged after (categorisations/category_terms/
-- listings row counts — only listing_category_terms and one column go away).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

drop table if exists public.listing_category_terms;

alter table public.categorisations
  drop column if exists applies_to_listings;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_category_terms') then
    raise exception 'VERIFY FAILED: listing_category_terms still exists';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'categorisations' and column_name = 'applies_to_listings') then
    raise exception 'VERIFY FAILED: categorisations.applies_to_listings still exists';
  end if;
  raise notice 'VERIFY PASSED: listing_category_terms and categorisations.applies_to_listings removed';
end $$;

-- Row counts — categorisations/category_terms/listings must be UNCHANGED.
select
  'categorisations'   as tbl, count(*) as rows from public.categorisations   union all
  select 'category_terms',    count(*) from public.category_terms           union all
  select 'listings',          count(*) from public.listings
order by tbl;
