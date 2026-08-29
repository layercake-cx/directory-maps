-- ============================================================
-- Migration: 20260829020000_create_listing_category_terms
-- Description: Extends the categorisation model (20260714130000) so a
--              client-wide categorisation (e.g. "Sector") can tag map
--              listings, not just directory entries. Today, a map's CSV
--              import can only attach a filter_<key> column to the
--              map-scoped map_filter_fields/listing_filter_values system
--              (src/lib/filterFields.js) — there is no path for imported
--              map data to attach to a categorisation at all, unlike
--              directory-entry import which already resolves category_<key>
--              columns against categorisations (DirectoryEntriesPanel.jsx).
--              This migration closes that gap: listing_category_terms is
--              the exact peer of entry_category_terms, keyed off listings
--              instead of directory_entries. map_filter_fields/
--              listing_filter_values are left completely untouched — this
--              is additive only, so the one live client currently using
--              map_filter_fields is entirely unaffected (see
--              docs/DEPLOYMENTS.md entry for this change for the full
--              rationale).
--              Also adds categorisations.applies_to_listings (boolean,
--              default false) as an independent axis alongside the existing
--              applies_to ('directory'/'entry'/'both') column — kept
--              separate rather than overloading applies_to's existing
--              values, since 'both' already has an established meaning
--              (directory + entry) that this does not change.
-- Affected tables: listing_category_terms (new), categorisations (new
--                   column applies_to_listings only, default false —
--                   existing rows unaffected)
-- Rollback: _20260829020000_create_listing_category_terms.rollback.sql
-- Author: Claude Code
-- Date: 2026-08-29
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'categorisations') then
    raise exception 'ABORT: table public.categorisations does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'category_terms') then
    raise exception 'ABORT: table public.category_terms does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listings') then
    raise exception 'ABORT: table public.listings does not exist';
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_category_terms') then
    raise exception 'ABORT: listing_category_terms already exists — migration may have already run';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'categorisations' and column_name = 'applies_to_listings') then
    raise exception 'ABORT: categorisations.applies_to_listings already exists — migration may have already run';
  end if;
end $$;

select
  'categorisations'   as tbl, count(*) as rows from public.categorisations   union all
  select 'category_terms',    count(*) from public.category_terms           union all
  select 'listings',          count(*) from public.listings
order by tbl;
-- Save this output. categorisations/category_terms/listings row counts must
-- be unchanged after (new table + new nullable-default column only).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.categorisations
  add column applies_to_listings boolean not null default false;

comment on column public.categorisations.applies_to_listings is
  'Independent of applies_to (directory/entry/both) — when true, this categorisation is also offered for tagging map listings via listing_category_terms.';

create table public.listing_category_terms (
  listing_id text not null references public.listings(id) on delete cascade,
  term_id uuid not null references public.category_terms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, term_id)
);

create index idx_lct_listing on public.listing_category_terms(listing_id);
create index idx_lct_term on public.listing_category_terms(term_id);

comment on table public.listing_category_terms is
  'Tags a map listing with a categorisation term (peer of entry_category_terms) — lets a client-wide categorisation (e.g. "Sector") apply to map listings, not just directory entries. Peer of listing_filter_values but pure many-to-many, no free-text variant, matching entry_category_terms.';

-- ------------------------------------------------------------
-- RLS: tenant-scoped like listing_filter_values, plus anon read for
-- published maps only (exact mirror of listing_filter_values_anon_select).
-- ------------------------------------------------------------

alter table public.listing_category_terms enable row level security;

create policy "listing_category_terms_admin_all"
  on public.listing_category_terms for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "listing_category_terms_own_client"
  on public.listing_category_terms for all
  to authenticated
  using (
    listing_id in (
      select l.id from public.listings l
      join public.maps m on m.id = l.map_id
      where m.client_id = public.current_user_client_id()
    )
  )
  with check (
    listing_id in (
      select l.id from public.listings l
      join public.maps m on m.id = l.map_id
      where m.client_id = public.current_user_client_id()
    )
  );

create policy "listing_category_terms_anon_select"
  on public.listing_category_terms for select
  to anon
  using (
    exists (
      select 1
      from public.listings l
      join public.maps m on m.id = l.map_id
      where l.id = listing_category_terms.listing_id
        and m.published_at is not null
    )
  );

grant select, insert, update, delete on table public.listing_category_terms to authenticated, service_role;
grant select on table public.listing_category_terms to anon;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'listing_category_terms') then
    raise exception 'VERIFY FAILED: listing_category_terms was not created';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'categorisations' and column_name = 'applies_to_listings') then
    raise exception 'VERIFY FAILED: categorisations.applies_to_listings was not created';
  end if;
  raise notice 'VERIFY PASSED: listing_category_terms + categorisations.applies_to_listings created';
end $$;

-- Row counts — categorisations/category_terms/listings must be UNCHANGED.
select
  'categorisations'   as tbl, count(*) as rows from public.categorisations   union all
  select 'category_terms',    count(*) from public.category_terms           union all
  select 'listings',          count(*) from public.listings
order by tbl;

-- New table must start empty
select 'listing_category_terms' as tbl, count(*) as rows from public.listing_category_terms;

-- RLS enabled
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'listing_category_terms';
-- Must show rowsecurity = true

-- Orphan checks — must return 0
select count(*) as orphaned_lct_listing
  from public.listing_category_terms x where not exists (select 1 from public.listings l where l.id = x.listing_id);
select count(*) as orphaned_lct_term
  from public.listing_category_terms x where not exists (select 1 from public.category_terms t where t.id = x.term_id);

-- Confirm the one live client's existing map_filter_fields data is untouched
select
  'map_filter_fields'      as tbl, count(*) as rows from public.map_filter_fields      union all
  select 'listing_filter_values', count(*) from public.listing_filter_values
order by tbl;
-- Compare against the equivalent pre-migration counts you already have on
-- record for this client's map — must be identical (this migration does
-- not touch either table).
