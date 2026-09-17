-- ============================================================
-- Migration: 20260917130000_categories_v2_schema_foundation
-- Description: Schema foundation for "Categories V2" on maps (see
--              docs/DEPLOYMENTS.md entry dated 2026-09-17 and the plan
--              this implements). Two purely additive changes, no data
--              touched, zero behaviour change until an admin opts in:
--                1. map_filter_fields.field_type gains 'boolean' as an
--                   allowed value, alongside the existing 'single_select',
--                   'multi_select', 'text' — matching categorisations'
--                   field_type (20260914170000), which already has
--                   'boolean'. Existing rows/behaviour are unaffected;
--                   this only widens the check constraint.
--                2. maps.color_filter_field_id (nullable FK to
--                   map_filter_fields) — which filter field's option
--                   colours should drive pin colour, in place of the
--                   map's Group. NULL (the default for every existing
--                   map) means "colour by Group", i.e. today's exact
--                   behaviour — this is the "one explicit, visible
--                   choice" replacing Group's automatic colour link,
--                   opt-in only.
--              This migration does NOT touch groups, listings, or any
--              existing map_filter_fields/map_filter_field_options/
--              listing_filter_values row. It does not migrate Group data
--              — that is a separate, later migration, gated on its own
--              sign-off (see plan doc, step 3).
-- Affected tables: map_filter_fields (constraint only), maps (add column)
-- Rollback: _20260917130000_categories_v2_schema_foundation.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-17
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn)
-- -> run POST-MIGRATION VERIFICATION -> only then apply on PRODUCTION
-- (gxixwdjfmegxcxfeflro) after explicit sign-off. Production also has two
-- live IAPCO maps (0adab038-3cc6-41a5-8187-80e11404af86,
-- bc37a36e-ca6d-48e7-b5db-65f78cbc80a3) with real Group + filter data —
-- this migration does not touch their data (additive schema only), but
-- confirm that with the integrity checklist below before and after anyway.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'map_filter_fields') then
    raise exception 'ABORT: table public.map_filter_fields does not exist';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'maps') then
    raise exception 'ABORT: table public.maps does not exist';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps' and column_name = 'color_filter_field_id'
  ) then
    raise exception 'ABORT: column maps.color_filter_field_id already exists — migration may have already run';
  end if;
  if exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'map_filter_fields'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%boolean%'
  ) then
    raise exception 'ABORT: map_filter_fields.field_type check constraint already allows boolean — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding. All of these must be UNCHANGED
-- after (additive column + widened constraint only, no rows touched).
select
  'maps'               as tbl, count(*) as rows from public.maps               union all
  select 'map_filter_fields',       count(*) from public.map_filter_fields       union all
  select 'map_filter_field_options', count(*) from public.map_filter_field_options union all
  select 'listing_filter_values',    count(*) from public.listing_filter_values
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- 1. Widen map_filter_fields.field_type to also allow 'boolean'.
-- The existing check constraint is unnamed in the original migration
-- (20260713120000_create_map_filter_fields.sql), so Postgres auto-named
-- it — look it up rather than assume the generated name, drop it, and
-- recreate with 'boolean' added.
do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'map_filter_fields'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%field_type%';

  if v_constraint_name is null then
    raise exception 'ABORT: could not find the existing check constraint on map_filter_fields.field_type';
  end if;

  execute format('alter table public.map_filter_fields drop constraint %I', v_constraint_name);
  execute $c$alter table public.map_filter_fields
    add constraint map_filter_fields_field_type_check
    check (field_type in ('single_select', 'multi_select', 'text', 'boolean'))$c$;
end $$;

-- 2. Per-map "colour by this category" setting. NULL = colour by Group
-- (today's exact behaviour) for every existing map.
alter table public.maps
  add column if not exists color_filter_field_id uuid null
    references public.map_filter_fields(id) on delete set null;

comment on column public.maps.color_filter_field_id is
  'Which map_filter_fields row''s option colours drive pin colour, in place of Group. NULL (default) means "colour by Group" — today''s exact behaviour, unchanged until an admin deliberately points colour at a category.';

create index if not exists idx_maps_color_filter_field_id
  on public.maps(color_filter_field_id);


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'map_filter_fields'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%boolean%'
  ) then
    raise exception 'VERIFY FAILED: map_filter_fields.field_type check constraint does not allow boolean';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps' and column_name = 'color_filter_field_id'
  ) then
    raise exception 'VERIFY FAILED: maps.color_filter_field_id was not created';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maps' and column_name = 'color_filter_field_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'VERIFY FAILED: maps.color_filter_field_id should be nullable';
  end if;

  if exists (select 1 from public.maps where color_filter_field_id is not null) then
    raise exception 'VERIFY FAILED: color_filter_field_id should be null for every existing map immediately after this migration';
  end if;

  raise notice 'VERIFY PASSED: field_type now allows boolean, color_filter_field_id created and null for every existing map';
end $$;

-- Row counts — must be UNCHANGED from pre-migration (no rows added/removed).
select
  'maps'               as tbl, count(*) as rows from public.maps               union all
  select 'map_filter_fields',       count(*) from public.map_filter_fields       union all
  select 'map_filter_field_options', count(*) from public.map_filter_field_options union all
  select 'listing_filter_values',    count(*) from public.listing_filter_values
order by tbl;

-- Every map must have color_filter_field_id = null right after this migration.
select count(*) as maps_with_color_field_set
from public.maps where color_filter_field_id is not null;
-- Expected: 0

-- RLS unaffected by this migration (no policy changes) — confirm still enabled.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('maps', 'map_filter_fields');
-- Both rows must show rowsecurity = true

-- Specifically confirm IAPCO's two live maps are untouched by this migration
-- (schema-only change — these should simply show color_filter_field_id = null
-- like every other map).
select id, color_filter_field_id
from public.maps
where id in ('0adab038-3cc6-41a5-8187-80e11404af86', 'bc37a36e-ca6d-48e7-b5db-65f78cbc80a3');
-- Expected: both rows present (if this environment has them), color_filter_field_id null
