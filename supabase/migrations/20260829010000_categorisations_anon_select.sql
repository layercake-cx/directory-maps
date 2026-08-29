-- ============================================================
-- Migration: 20260829010000_categorisations_anon_select
-- Description: categorisations/category_terms/directory_category_terms/
--              entry_category_terms (20260714130000_create_categorisations.sql)
--              were created with only admin/own-client authenticated RLS —
--              no anon-select policy, because there was no publish concept
--              for directories at the time. Directory publishing has since
--              shipped (docs/DIRECTORIES.md DIR-E2), and a directory-sourced
--              map's public embed (EmbedMap.jsx, anon-only Supabase client,
--              same rationale as directory_map_associations_anon_select,
--              20260828130000) needs to read this data to render category-
--              driven filter chips. Without this, anon reads return zero
--              rows and the filter bar for a directory-sourced map silently
--              stays empty — the same class of bug already found once in
--              production for directory_map_associations.
--              Scoping mirrors map_filter_fields_anon_select
--              (20260713120000): gated to published (directories.published_at
--              is not null), not unconditional, since categorisation labels
--              for an unpublished client are not otherwise public.
-- Affected tables: categorisations, category_terms, directory_category_terms,
--                   entry_category_terms (new RLS policies + grants only,
--                   no data/column change)
-- Rollback: _20260829010000_categorisations_anon_select.rollback.sql
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directories') then
    raise exception 'ABORT: table public.directories does not exist';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('categorisations', 'category_terms', 'directory_category_terms', 'entry_category_terms')
      and policyname like '%_anon_select'
  ) then
    raise exception 'ABORT: an anon_select policy already exists on one of these tables — migration may have already run';
  end if;
end $$;

select
  'categorisations'           as tbl, count(*) as rows from public.categorisations           union all
  select 'category_terms',            count(*) from public.category_terms                    union all
  select 'directory_category_terms',  count(*) from public.directory_category_terms          union all
  select 'entry_category_terms',      count(*) from public.entry_category_terms
order by tbl;
-- Save this output. Must be unchanged after (RLS/grant only, no data change).


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- categorisations: visible to anon only for a client with at least one
-- published directory (mirrors map_filter_fields_anon_select's "published
-- maps only" gate, not unconditional).
create policy "categorisations_anon_select"
  on public.categorisations for select
  to anon
  using (
    exists (
      select 1 from public.directories d
      where d.client_id = categorisations.client_id
        and d.published_at is not null
    )
  );

-- category_terms: same gate, one join further out.
create policy "category_terms_anon_select"
  on public.category_terms for select
  to anon
  using (
    exists (
      select 1
      from public.categorisations c
      join public.directories d on d.client_id = c.client_id
      where c.id = category_terms.categorisation_id
        and d.published_at is not null
    )
  );

-- directory_category_terms: scoped to the specific directory being published
-- (tighter than the client-wide gate above, since this reveals which
-- directory carries which term).
create policy "directory_category_terms_anon_select"
  on public.directory_category_terms for select
  to anon
  using (
    exists (
      select 1 from public.directories d
      where d.id = directory_category_terms.directory_id
        and d.published_at is not null
    )
  );

-- entry_category_terms: scoped to the specific entry's directory being
-- published (exact mirror of listing_filter_values_anon_select).
create policy "entry_category_terms_anon_select"
  on public.entry_category_terms for select
  to anon
  using (
    exists (
      select 1
      from public.directory_entries e
      join public.directories d on d.id = e.directory_id
      where e.id = entry_category_terms.entry_id
        and d.published_at is not null
    )
  );

grant select on table public.categorisations to anon;
grant select on table public.category_terms to anon;
grant select on table public.directory_category_terms to anon;
grant select on table public.entry_category_terms to anon;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categorisations' and policyname = 'categorisations_anon_select') then
    raise exception 'VERIFY FAILED: categorisations_anon_select policy was not created';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'category_terms' and policyname = 'category_terms_anon_select') then
    raise exception 'VERIFY FAILED: category_terms_anon_select policy was not created';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'directory_category_terms' and policyname = 'directory_category_terms_anon_select') then
    raise exception 'VERIFY FAILED: directory_category_terms_anon_select policy was not created';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'entry_category_terms' and policyname = 'entry_category_terms_anon_select') then
    raise exception 'VERIFY FAILED: entry_category_terms_anon_select policy was not created';
  end if;
  raise notice 'VERIFY PASSED: anon_select policies created on all four categorisation tables';
end $$;

select
  'categorisations'           as tbl, count(*) as rows from public.categorisations           union all
  select 'category_terms',            count(*) from public.category_terms                    union all
  select 'directory_category_terms',  count(*) from public.directory_category_terms          union all
  select 'entry_category_terms',      count(*) from public.entry_category_terms
order by tbl;
-- Row counts must be unchanged from the pre-migration output above.
