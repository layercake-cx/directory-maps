-- ============================================================
-- Migration: 20260914200000_recover_industry_sector_entry_tags
-- Description: Follow-up/fix to 20260914190000_recover_industry_sector_categorisation,
--              same day. That migration correctly created the
--              "Industry Sector" categorisation (id found by key below),
--              its 42 terms, and its directory attachment — but tagged
--              ZERO entries, because it assumed listing_filter_values.
--              listing_id needed a name-matched `listings` row to resolve
--              to a directory entry. Investigated live in production:
--              this map/directory pair has ZERO rows in `listings` (the
--              map's pins come live from the directory instead, per
--              directory_as_datasource) — but listing_filter_values.
--              listing_id was never cleaned up when that happened, and it
--              turns out to hold the SAME uuids as directory_entries.id
--              directly (verified: all 176 listing_filter_values.listing_id
--              values for this field exactly match an id in this
--              directory's 329 entries — no name matching needed or
--              wanted). This migration redoes the tagging with that
--              correct, direct join.
--
--              Idempotent-safe to run after the first migration's
--              (failed, zero-row) tagging attempt: on conflict do nothing
--              on the (entry_id, term_id) primary key.
-- Affected tables: entry_category_terms (insert only — categorisations/
--                   category_terms/categorisation_attachments untouched,
--                   already correct from the prior migration)
-- Rollback: _20260914200000_recover_industry_sector_entry_tags.rollback.sql
-- Author: Claude Code (requested and reviewed live with the user)
-- Date: 2026-09-14
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- Same tooling-gap note as 20260914190000: no real dry run was possible
-- (ephemeral dump role has no SELECT grant on these tables), and this
-- migration's data only exists in production. Purely additive.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from public.categorisations
    where client_id = 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72' and key = 'industry_sector'
  ) then
    raise exception 'ABORT: industry_sector categorisation does not exist — run 20260914190000_recover_industry_sector_categorisation.sql first';
  end if;
end $$;

select count(*) as pre_tag_count from public.entry_category_terms ect
join public.category_terms ct on ct.id = ect.term_id
join public.categorisations c on c.id = ct.categorisation_id
where c.client_id = 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72' and c.key = 'industry_sector';
-- Expected: 0 (the prior migration's tagging attempt inserted nothing)


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

do $$
declare
  v_client_id text := 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72';
  v_directory_id text := '5645c858-0a9a-4787-8944-d8a5529089a9';
  v_field_id uuid := '7e7711a3-d81a-425d-b930-ac296e6ad874';
  v_categorisation_id uuid;
  v_tags_created integer;
begin
  select id into v_categorisation_id from public.categorisations
    where client_id = v_client_id and key = 'industry_sector';

  insert into public.entry_category_terms (entry_id, term_id)
  select distinct e.id, ct.id
  from public.listing_filter_values lfv
  join public.map_filter_field_options o on o.id = lfv.option_id
  join public.category_terms ct
    on ct.categorisation_id = v_categorisation_id and ct.slug = o.value
  join public.directory_entries e
    on e.id = lfv.listing_id and e.directory_id = v_directory_id
  where lfv.field_id = v_field_id
  on conflict (entry_id, term_id) do nothing;
  get diagnostics v_tags_created = row_count;

  raise notice 'Tagged % of 329 directory entries with an Industry Sector, via direct listing_filter_values.listing_id = directory_entries.id correspondence', v_tags_created;
end $$;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
declare
  v_tag_count integer;
begin
  select count(*) into v_tag_count from public.entry_category_terms ect
    join public.category_terms ct on ct.id = ect.term_id
    join public.categorisations c on c.id = ct.categorisation_id
    where c.client_id = 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72' and c.key = 'industry_sector';

  if v_tag_count = 0 then
    raise exception 'VERIFY FAILED: still 0 entries tagged — the direct-id join did not match either. Stop and investigate before telling the user this is fixed.';
  end if;

  raise notice 'VERIFY PASSED: % of 329 directory entries now carry an Industry Sector tag.', v_tag_count;
end $$;

-- Spot-check a sample of the actual recovered tags.
select e.name as entry_name, ct.label as sector
from public.entry_category_terms ect
join public.category_terms ct on ct.id = ect.term_id
join public.categorisations c on c.id = ct.categorisation_id
join public.directory_entries e on e.id = ect.entry_id
where c.client_id = 'a1b92aba-fcfb-485a-b1ba-c8d93344ff72' and c.key = 'industry_sector'
order by e.name
limit 20;
