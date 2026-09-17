-- ============================================================
-- Migration: 20260917150000_filter_option_split_tooling
-- Description: Repair tooling for a data-quality bug found while auditing
--              map 275d7e76-bc3a-4535-ad48-f824d7651119 (APMG's
--              "APMG_ Sample_Demo" map, client a011ee30-a532-4f17-bc2b-
--              8bb36b4c86c6) for the Categories V2 plan
--              (/Users/damianwatson/.claude/plans/abstract-bubbling-bird.md).
--              This map's Group data is clean (one group, no corruption) —
--              the bug is unrelated to Group and to the Group migration
--              tooling shipped earlier today. It's in this map's own
--              `map_filter_fields` "Courses Offered" (multi_select) field:
--              several options are several course names joined by ", "
--              stored as ONE literal option, instead of one option per
--              course — e.g. "Agile Business Analysis (AgileBA)
--              Certification, Agile Project Management (AgilePM)
--              Certification, ..." as a single option, while an atomic
--              "Agile Business Analysis" option ALSO exists separately.
--              Root cause: this field's import path only ever split
--              multi-value cells on `|` (see collectFieldTokens /
--              buildImportFilterValueRows in src/lib/filterFields.js) —
--              whatever populated this data used commas, which were never
--              split. This migration touches NO data; it defines
--              functions, invoked later, one field/option at a time, with
--              explicit review of the dry-run report first:
--
--                - dry_run_split_composite_options(field_id, delimiter)
--                  — READ-ONLY: for every option on the field whose label
--                  contains the delimiter, reports the pieces it would
--                  split into, which pieces match an existing option
--                  (case-insensitive) vs. would be created, and how many
--                  listings currently carry the composite option (the
--                  blast radius). Zero side effects.
--                - split_composite_filter_option(option_id, delimiter) —
--                  repairs ONE composite option: splits its label,
--                  finds-or-creates a matching atomic option per piece,
--                  re-tags every listing that had the composite option
--                  with the full set of atomic options instead (additive,
--                  skips a piece a listing is already tagged with),
--                  then deletes the now-unused composite option. Aborts
--                  if the option's label doesn't actually contain the
--                  delimiter (nothing to split).
--                - split_all_composite_options_for_field(field_id,
--                  delimiter) — convenience wrapper: calls the above for
--                  every currently-composite option on the field, in one
--                  transaction, returning a per-option summary.
--                - verify_field_has_no_composite_options(field_id,
--                  delimiter) — READ-ONLY post-check: any option label
--                  still containing the delimiter is a failure.
--
--              Deliberately NOT granted to `authenticated` — same posture
--              as the Group migration tooling (20260917140000): internal,
--              one-off repair tools invoked via a privileged connection,
--              never exposed to the app or end users.
-- Affected tables: none (function definitions only)
-- Rollback: _20260917150000_filter_option_split_tooling.rollback.sql
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
-- (gxixwdjfmegxcxfeflro) after explicit sign-off. Applying THIS migration
-- is low-risk (function definitions only) — actually calling
-- split_composite_filter_option()/split_all_composite_options_for_field()
-- against APMG's real field id (f990d4a6-842d-444d-b6a5-192396bf1f6f) is a
-- separate decision, and per the audit that found this bug, has NOT been
-- exercised against real data by this agent session (no service-role/
-- privileged DB connection was available — only a read-only pass via the
-- production REST API using the public anon key).
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'map_filter_field_options') then
    raise exception 'ABORT: table public.map_filter_field_options does not exist';
  end if;
  if exists (select 1 from pg_proc where proname = 'split_composite_filter_option') then
    raise exception 'ABORT: function split_composite_filter_option already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding. ALL of these must be UNCHANGED
-- after (this migration only defines functions, touches no data).
select
  'map_filter_fields'        as tbl, count(*) as rows from public.map_filter_fields        union all
  select 'map_filter_field_options', count(*) from public.map_filter_field_options   union all
  select 'listing_filter_values',    count(*) from public.listing_filter_values
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- Deterministic, collision-safe slug for a new option's `value` (import
-- key) derived from its label, within one field. Mirrors slugifyKey() in
-- src/lib/filterFields.js closely enough for this one-off repair purpose.
create or replace function public._slugify_option_value(p_field_id uuid, p_label text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base text;
  v_candidate text;
  v_n integer := 2;
begin
  v_base := lower(trim(p_label));
  v_base := regexp_replace(v_base, '[''"]', '', 'g');
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '_', 'g');
  v_base := regexp_replace(v_base, '^_+|_+$', '', 'g');
  v_base := left(coalesce(nullif(v_base, ''), 'opt'), 60);

  v_candidate := v_base;
  while exists (
    select 1 from public.map_filter_field_options
    where field_id = p_field_id and value = v_candidate
  ) loop
    v_candidate := left(v_base, 55) || '_' || v_n;
    v_n := v_n + 1;
  end loop;

  return v_candidate;
end;
$$;

-- Read-only preview: what split_composite_filter_option would do for
-- every composite option on this field. Zero side effects.
create or replace function public.dry_run_split_composite_options(p_field_id uuid, p_delimiter text default ', ')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_field record;
  v_report jsonb;
begin
  select * into v_field from public.map_filter_fields where id = p_field_id;
  if v_field is null then
    raise exception 'Filter field % does not exist', p_field_id;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'option_id', o.id,
      'label', o.label,
      'listings_tagged', (select count(*) from public.listing_filter_values v where v.option_id = o.id),
      'pieces', (
        select jsonb_agg(jsonb_build_object(
          'piece', piece,
          'matches_existing_option_id', (
            select o2.id from public.map_filter_field_options o2
            where o2.field_id = p_field_id and lower(trim(o2.label)) = lower(trim(piece)) and o2.id <> o.id
            limit 1
          )
        ))
        from unnest(string_to_array(o.label, p_delimiter)) as piece
      )
    ) order by o.label
  )
  into v_report
  from public.map_filter_field_options o
  where o.field_id = p_field_id
    and position(p_delimiter in o.label) > 0;

  return jsonb_build_object(
    'field_id', p_field_id,
    'field_label', v_field.label,
    'delimiter', p_delimiter,
    'composite_options', coalesce(v_report, '[]'::jsonb),
    'composite_option_count', coalesce(jsonb_array_length(v_report), 0)
  );
end;
$$;

-- Repairs ONE composite option: split -> find-or-create atomic options ->
-- re-tag affected listings -> delete the composite option.
create or replace function public.split_composite_filter_option(p_option_id uuid, p_delimiter text default ', ')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_option record;
  v_field_id uuid;
  piece text;
  v_piece_option_id uuid;
  v_pieces_created integer := 0;
  v_pieces_matched integer := 0;
  v_listings_retagged integer := 0;
begin
  select * into v_option from public.map_filter_field_options where id = p_option_id;
  if v_option is null then
    raise exception 'ABORT: option % does not exist', p_option_id;
  end if;
  if position(p_delimiter in v_option.label) = 0 then
    raise exception 'ABORT: option % label does not contain delimiter % — nothing to split', p_option_id, p_delimiter;
  end if;
  v_field_id := v_option.field_id;

  for piece in select trim(t) from unnest(string_to_array(v_option.label, p_delimiter)) as t loop
    if piece = '' then continue; end if;

    select id into v_piece_option_id
    from public.map_filter_field_options
    where field_id = v_field_id and lower(trim(label)) = lower(piece) and id <> p_option_id;

    if v_piece_option_id is null then
      insert into public.map_filter_field_options (field_id, value, label, color, sort_order)
      values (
        v_field_id,
        public._slugify_option_value(v_field_id, piece),
        piece,
        v_option.color,
        coalesce((select max(sort_order) + 1 from public.map_filter_field_options where field_id = v_field_id), 0)
      )
      returning id into v_piece_option_id;
      v_pieces_created := v_pieces_created + 1;
    else
      v_pieces_matched := v_pieces_matched + 1;
    end if;

    -- Tag every listing that had the composite option with this atomic
    -- one too (additive; the partial unique index on
    -- (listing_id, field_id, option_id) stops duplicate tags).
    insert into public.listing_filter_values (listing_id, field_id, option_id)
    select v.listing_id, v_field_id, v_piece_option_id
    from public.listing_filter_values v
    where v.option_id = p_option_id
    on conflict do nothing;
  end loop;

  select count(*) into v_listings_retagged
  from public.listing_filter_values where option_id = p_option_id;

  -- Remove the composite option's own tags, then the option itself.
  delete from public.listing_filter_values where option_id = p_option_id;
  delete from public.map_filter_field_options where id = p_option_id;

  return jsonb_build_object(
    'option_id', p_option_id,
    'original_label', v_option.label,
    'pieces_created', v_pieces_created,
    'pieces_matched_existing', v_pieces_matched,
    'listings_retagged', v_listings_retagged
  );
end;
$$;

-- Convenience wrapper: repairs every currently-composite option on a field
-- in one transaction.
create or replace function public.split_all_composite_options_for_field(p_field_id uuid, p_delimiter text default ', ')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  opt record;
  v_results jsonb := '[]'::jsonb;
begin
  for opt in
    select id from public.map_filter_field_options
    where field_id = p_field_id and position(p_delimiter in label) > 0
  loop
    v_results := v_results || jsonb_build_array(public.split_composite_filter_option(opt.id, p_delimiter));
  end loop;

  return jsonb_build_object('field_id', p_field_id, 'delimiter', p_delimiter, 'results', v_results);
end;
$$;

-- Read-only post-check: any option label still containing the delimiter
-- is a failure.
create or replace function public.verify_field_has_no_composite_options(p_field_id uuid, p_delimiter text default ', ')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_remaining jsonb;
begin
  select jsonb_agg(jsonb_build_object('option_id', id, 'label', label))
  into v_remaining
  from public.map_filter_field_options
  where field_id = p_field_id and position(p_delimiter in label) > 0;

  return jsonb_build_object(
    'field_id', p_field_id,
    'clean', v_remaining is null,
    'remaining_composite_options', coalesce(v_remaining, '[]'::jsonb),
    'total_options', (select count(*) from public.map_filter_field_options where field_id = p_field_id),
    'total_listing_tags', (
      select count(*) from public.listing_filter_values v
      join public.map_filter_field_options o on o.id = v.option_id
      where o.field_id = p_field_id
    )
  );
end;
$$;

comment on function public.dry_run_split_composite_options(uuid, text) is
  'Categories V2 data repair: read-only preview of splitting delimited composite option labels on a map_filter_fields field. No side effects.';
comment on function public.split_composite_filter_option(uuid, text) is
  'Categories V2 data repair: splits ONE composite option label into atomic options, re-tags affected listings, removes the composite option. Not granted to authenticated — invoke via a privileged connection only.';
comment on function public.split_all_composite_options_for_field(uuid, text) is
  'Categories V2 data repair: applies split_composite_filter_option to every composite option currently on a field, in one transaction.';
comment on function public.verify_field_has_no_composite_options(uuid, text) is
  'Categories V2 data repair: post-run check that no option label on a field still contains the delimiter.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'dry_run_split_composite_options') then
    raise exception 'VERIFY FAILED: dry_run_split_composite_options was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'split_composite_filter_option') then
    raise exception 'VERIFY FAILED: split_composite_filter_option was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'split_all_composite_options_for_field') then
    raise exception 'VERIFY FAILED: split_all_composite_options_for_field was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'verify_field_has_no_composite_options') then
    raise exception 'VERIFY FAILED: verify_field_has_no_composite_options was not created';
  end if;
  raise notice 'VERIFY PASSED: filter option split tooling functions created (no data touched)';
end $$;

-- Row counts — must be UNCHANGED from pre-migration.
select
  'map_filter_fields'        as tbl, count(*) as rows from public.map_filter_fields        union all
  select 'map_filter_field_options', count(*) from public.map_filter_field_options   union all
  select 'listing_filter_values',    count(*) from public.listing_filter_values
order by tbl;

-- Sanity check: these functions must NOT be callable by ordinary app users.
select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'dry_run_split_composite_options', 'split_composite_filter_option',
    'split_all_composite_options_for_field', 'verify_field_has_no_composite_options'
  );
-- Expected: 4 rows, security_type = 'DEFINER' for all
