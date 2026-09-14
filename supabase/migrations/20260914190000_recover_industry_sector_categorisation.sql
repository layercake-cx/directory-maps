-- ============================================================
-- Migration: 20260914190000_recover_industry_sector_categorisation
-- Description: One-off data recovery, not a schema change. The directory
--              "UK Associations Sample Map" (id 5645c858-0a9a-4787-8944-
--              d8a5529089a9, client a1b92aba-fcfb-485a-b1ba-c8d93344ff72,
--              329 entries, all source='csv') has zero Categorisations —
--              confirmed live in production (2026-09-14 investigation).
--              Its pins are now read live by map "UK Associations Sample
--              Map" (id 24f52c3d-cbfc-446d-bffc-b500f257b90c,
--              categorisation_attachments/directory_map_associations,
--              role=directory_as_datasource) INSTEAD OF that map's own
--              `listings` table — but the map's own listings still carry
--              real data: a `map_filter_fields` row "Industry Sector"
--              (id 7e7711a3-d81a-425d-b930-ac296e6ad874, single_select,
--              42 real options + one "test" placeholder) with 176
--              `listing_filter_values` rows tagging those listings. That
--              sector data was never carried over to the directory side
--              (the two are unrelated tables) and the CSV that originally
--              populated the 329 directory entries evidently had no
--              matching Categorisation to resolve a category column
--              against at import time, so nothing landed in
--              entry_category_terms either.
--
--              This migration recreates that "Industry Sector" facet as a
--              real, admin-visible Categorisation (client-wide, per the
--              existing model — docs/DIRECTORIES.md §4.3), attaches it to
--              the directory only (not the map — the map keeps its own
--              native map_filter_fields entry untouched, unrelated
--              system), and tags each directory entry with whichever
--              sector its same-named map listing already held. Matching
--              is exact, case-insensitive, whitespace-trimmed name
--              equality between directory_entries.name and listings.name
--              — the only shared identifier between the two records. This
--              is a best-effort recovery: entries whose name doesn't
--              exactly match a tagged listing (renamed, retyped, or never
--              tagged on the map side to begin with) get no term. Coverage
--              is reported in the post-migration verification block below
--              — read it before calling this "done".
--
--              The "test" option (map_filter_field_options.value='test')
--              is deliberately excluded — a testing artifact, not a real
--              sector.
-- Affected tables: categorisations, category_terms,
--                   categorisation_attachments, entry_category_terms
--                   (all inserts only — no existing row anywhere is
--                   modified or deleted; listings/map_filter_fields/
--                   directory_entries are read-only in this migration)
-- Rollback: _20260914190000_recover_industry_sector_categorisation.rollback.sql
-- Author: Claude Code (requested and reviewed live with the user)
-- Date: 2026-09-14
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- Note: a real interactive dry run could not be performed by the agent
-- that wrote this migration — the CLI's ephemeral dump role has no SELECT
-- grant on these tables (docs/DATABASE_MIGRATIONS.md's documented CLI
-- 2.75.0 tooling gap), and this migration's whole premise depends on
-- production-only rows (this specific directory/map/field) that don't
-- exist on staging to test against. Applied directly to production with
-- the user's explicit request and prior sign-off for this exact
-- investigation/recovery; the migration's own pre/post assertions are the
-- safety net here, and it is 100% additive (see Affected tables above).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.directories where id = '5645c858-0a9a-4787-8944-d8a5529089a9') then
    raise exception 'ABORT: target directory does not exist — has its id changed?';
  end if;
  if not exists (select 1 from public.map_filter_fields where id = '7e7711a3-d81a-425d-b930-ac296e6ad874') then
    raise exception 'ABORT: source map_filter_fields row does not exist — has its id changed?';
  end if;
  if exists (
    select 1 from public.categorisations
    where client_id = 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72' and key = 'industry_sector'
  ) then
    raise exception 'ABORT: a categorisation with key industry_sector already exists for this client — this migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding. All four must be UNCHANGED
-- after for every row that existed before this migration; this migration
-- only adds new rows.
select
  'categorisations'            as tbl, count(*) as rows from public.categorisations            union all
  select 'category_terms',             count(*) from public.category_terms                     union all
  select 'categorisation_attachments', count(*) from public.categorisation_attachments          union all
  select 'entry_category_terms',       count(*) from public.entry_category_terms
order by tbl;

-- How many of the 329 directory entries have a same-named, sector-tagged
-- listing on the source map — this is the ceiling on how many entries
-- this migration can actually tag. Inspect before proceeding; if this is
-- much lower than expected, stop and investigate the name-matching
-- assumption before inserting anything.
select count(distinct e.id) as matchable_entries
from public.directory_entries e
join public.listings l
  on l.map_id = '24f52c3d-cbfc-446d-bffc-b500f257b90c'
 and lower(trim(l.name)) = lower(trim(e.name))
join public.listing_filter_values lfv
  on lfv.listing_id = l.id and lfv.field_id = '7e7711a3-d81a-425d-b930-ac296e6ad874'
where e.directory_id = '5645c858-0a9a-4787-8944-d8a5529089a9';


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

do $$
declare
  v_client_id text := 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72';
  v_directory_id text := '5645c858-0a9a-4787-8944-d8a5529089a9';
  v_map_id text := '24f52c3d-cbfc-446d-bffc-b500f257b90c';
  v_field_id uuid := '7e7711a3-d81a-425d-b930-ac296e6ad874';
  v_categorisation_id uuid;
  v_terms_created integer;
  v_tags_created integer;
begin
  insert into public.categorisations (client_id, key, label, field_type, is_active)
  values (v_client_id, 'industry_sector', 'Industry Sector', 'single_select', true)
  returning id into v_categorisation_id;

  insert into public.category_terms (categorisation_id, label, slug, sort_order)
  select v_categorisation_id, o.label, o.value, o.sort_order
  from public.map_filter_field_options o
  where o.field_id = v_field_id and o.value <> 'test';
  get diagnostics v_terms_created = row_count;

  if v_terms_created <> 42 then
    raise exception 'ABORT: expected exactly 42 non-test sector options, found %. Aborting so nothing partial is committed.', v_terms_created;
  end if;

  insert into public.categorisation_attachments (categorisation_id, target_type, target_id)
  values (v_categorisation_id, 'directory', v_directory_id);

  insert into public.entry_category_terms (entry_id, term_id)
  select distinct e.id, ct.id
  from public.directory_entries e
  join public.listings l
    on l.map_id = v_map_id
   and lower(trim(l.name)) = lower(trim(e.name))
  join public.listing_filter_values lfv
    on lfv.listing_id = l.id and lfv.field_id = v_field_id
  join public.map_filter_field_options o
    on o.id = lfv.option_id
  join public.category_terms ct
    on ct.categorisation_id = v_categorisation_id and ct.slug = o.value
  where e.directory_id = v_directory_id
  on conflict (entry_id, term_id) do nothing;
  get diagnostics v_tags_created = row_count;

  raise notice 'Created categorisation % (industry_sector) with % terms, attached to directory %, tagged % entries by name match', v_categorisation_id, v_terms_created, v_directory_id, v_tags_created;
end $$;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- Run immediately after applying. Read the coverage numbers, not just
-- the pass/fail — partial name-match coverage is expected, not a bug.
-- ------------------------------------------------------------

do $$
declare
  v_cat_id uuid;
  v_term_count integer;
  v_attach_count integer;
  v_tag_count integer;
begin
  select id into v_cat_id from public.categorisations
    where client_id = 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72' and key = 'industry_sector';
  if v_cat_id is null then
    raise exception 'VERIFY FAILED: industry_sector categorisation was not created';
  end if;

  select count(*) into v_term_count from public.category_terms where categorisation_id = v_cat_id;
  if v_term_count <> 42 then
    raise exception 'VERIFY FAILED: expected 42 terms, found %', v_term_count;
  end if;

  select count(*) into v_attach_count from public.categorisation_attachments
    where categorisation_id = v_cat_id and target_type = 'directory' and target_id = '5645c858-0a9a-4787-8944-d8a5529089a9';
  if v_attach_count <> 1 then
    raise exception 'VERIFY FAILED: expected exactly 1 directory attachment, found %', v_attach_count;
  end if;

  select count(*) into v_tag_count from public.entry_category_terms ect
    join public.category_terms ct on ct.id = ect.term_id
    where ct.categorisation_id = v_cat_id;

  raise notice 'VERIFY PASSED: categorisation % created with 42 terms and 1 directory attachment. % of 329 directory entries tagged by name match.', v_cat_id, v_tag_count;
end $$;

-- Row counts — categorisations/category_terms/categorisation_attachments/
-- entry_category_terms should each be higher than the pre-migration
-- snapshot by exactly (1, 42, 1, tag_count) respectively; nothing else
-- should have moved.
select
  'categorisations'            as tbl, count(*) as rows from public.categorisations            union all
  select 'category_terms',             count(*) from public.category_terms                     union all
  select 'categorisation_attachments', count(*) from public.categorisation_attachments          union all
  select 'entry_category_terms',       count(*) from public.entry_category_terms
order by tbl;

-- Spot-check: a handful of tagged entries with their recovered sector, to
-- eyeball for obviously-wrong matches before telling the user it's done.
select e.name as entry_name, ct.label as sector
from public.entry_category_terms ect
join public.category_terms ct on ct.id = ect.term_id
join public.directory_entries e on e.id = ect.entry_id
where ct.categorisation_id = (
  select id from public.categorisations
  where client_id = 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72' and key = 'industry_sector'
)
order by e.name
limit 15;
