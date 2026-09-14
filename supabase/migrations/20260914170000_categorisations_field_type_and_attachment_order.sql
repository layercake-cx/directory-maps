-- ============================================================
-- Migration: 20260914170000_categorisations_field_type_and_attachment_order
-- Description: Adds two purely additive columns needed for the directory
--              browse/entry redesign (Claude Design concept — see
--              docs/DEPLOYMENTS.md entry dated 2026-09-14):
--                - categorisations.field_type ('multi_select' | 'single_select'
--                  | 'boolean') — until now every categorisation was rendered
--                  as multi-select tags everywhere (hardcoded in
--                  categorisationsAsFilterFields(), src/lib/categorisations.js).
--                  This lets an admin define a single-choice facet (e.g.
--                  "Region") or a yes/no switch facet (e.g. "Chartered")
--                  instead of only tag groups. Existing rows default to
--                  'multi_select', so current behaviour is unchanged.
--                - categorisation_attachments.sort_order (integer) — until
--                  now attachments had no explicit order; the new filter
--                  rail needs admin-controlled facet order. Defaults to 0
--                  (current alphabetical-by-label rendering is unaffected
--                  until an admin deliberately reorders).
--              A 'boolean' categorisation is represented as a categorisation
--              with exactly one term (conventionally slug 'yes') — presence
--              of an entry_category_terms row means true. No new tables or
--              columns needed for that; category_terms/entry_category_terms
--              are reused unchanged.
-- Affected tables: categorisations (add column), categorisation_attachments
--                   (add column)
-- Rollback: _20260914170000_categorisations_field_type_and_attachment_order.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-14
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
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'categorisation_attachments') then
    raise exception 'ABORT: table public.categorisation_attachments does not exist';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisations' and column_name = 'field_type'
  ) then
    raise exception 'ABORT: column categorisations.field_type already exists — migration may have already run';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisation_attachments' and column_name = 'sort_order'
  ) then
    raise exception 'ABORT: column categorisation_attachments.sort_order already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding. Both tables must be UNCHANGED
-- after (additive columns only, no rows touched).
select
  'categorisations'            as tbl, count(*) as rows from public.categorisations            union all
  select 'categorisation_attachments', count(*) from public.categorisation_attachments
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.categorisations
  add column if not exists field_type text not null default 'multi_select'
    check (field_type in ('multi_select', 'single_select', 'boolean'));

comment on column public.categorisations.field_type is
  'How this categorisation''s terms are chosen: multi_select (tags, the original/default behaviour), single_select (one value, e.g. Region), boolean (a single yes/no switch, backed by exactly one term).';

alter table public.categorisation_attachments
  add column if not exists sort_order integer not null default 0;

comment on column public.categorisation_attachments.sort_order is
  'Admin-controlled render order for this categorisation within its target''s filter rail. Lower first. Defaults to 0 (ties fall back to label order).';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisations' and column_name = 'field_type'
  ) then
    raise exception 'VERIFY FAILED: categorisations.field_type was not created';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisations' and column_name = 'field_type' and is_nullable = 'YES'
  ) then
    raise exception 'VERIFY FAILED: categorisations.field_type should be NOT NULL';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categorisation_attachments' and column_name = 'sort_order'
  ) then
    raise exception 'VERIFY FAILED: categorisation_attachments.sort_order was not created';
  end if;
  if exists (
    select 1 from public.categorisations where field_type is distinct from 'multi_select'
  ) then
    raise exception 'VERIFY FAILED: an existing categorisation did not default to multi_select';
  end if;
  raise notice 'VERIFY PASSED: field_type and sort_order columns created, existing rows defaulted correctly';
end $$;

-- Row counts — must be UNCHANGED from pre-migration (no rows added/removed).
select
  'categorisations'            as tbl, count(*) as rows from public.categorisations            union all
  select 'categorisation_attachments', count(*) from public.categorisation_attachments
order by tbl;

-- Every existing categorisation must now read 'multi_select'.
select field_type, count(*) from public.categorisations group by field_type;
-- Expected: a single row, field_type = 'multi_select', count = pre-migration total.

-- RLS unaffected by this migration (no policy changes) — confirm it is still enabled.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('categorisations', 'categorisation_attachments');
-- Both rows must show rowsecurity = true
