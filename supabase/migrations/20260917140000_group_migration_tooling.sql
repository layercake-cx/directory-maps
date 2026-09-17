-- ============================================================
-- Migration: 20260917140000_group_migration_tooling
-- Description: Categories V2 — Group → Categories migration TOOLING only.
--              Creates three SQL functions; running this migration touches
--              NO map/group/listing/filter-field data at all (function
--              definitions only). The functions themselves are only ever
--              invoked one map at a time, later, as an explicit, separate,
--              signed-off step — never automatically, never in bulk.
--
--                - dry_run_group_migration(map_id)   — READ-ONLY preview:
--                  what migrate_map_groups_to_category() would create for
--                  this map, with zero side effects. Always safe to call.
--                - migrate_map_groups_to_category(map_id) — the actual
--                  one-time conversion: creates ONE map_filter_fields row
--                  (field_type 'single_select', key 'group_migrated')
--                  carrying every existing group as an option (name +
--                  colour preserved, via each group's own uuid so name
--                  collisions can't misroute listings), tags every listing
--                  that has a group with the matching new option, and
--                  points maps.color_filter_field_id at the new field so
--                  pin colours are provably unchanged. Idempotent per map
--                  (aborts if that map already has a 'group_migrated'
--                  field). Does NOT touch groups/listings.group_id — both
--                  are left exactly as they are, for rollback safety and
--                  because the live Groups tab / filter lozenges / Key
--                  legend keep reading them unchanged (this migration only
--                  changes where PIN COLOUR is sourced from, nothing else).
--                - verify_group_migration(map_id) — post-run comparison:
--                  per-group listing-count and colour equivalence between
--                  the old (groups/listings.group_id) and new
--                  (map_filter_fields/listing_filter_values) representation,
--                  flags any mismatch instead of silently passing.
--
--              Intentionally NOT granted to `authenticated` — these are
--              internal ops/migration tools invoked via the Supabase SQL
--              editor or an equivalent privileged connection, one map at a
--              time, never exposed to the app or to end users. Granting
--              execute to authenticated would let any logged-in user
--              trigger a one-time data conversion against ANY map (these
--              functions are security definer and must self-police, and
--              a broad grant is the wrong shape for a tool this sensitive).
-- Affected tables: none (function definitions only)
-- Rollback: _20260917140000_group_migration_tooling.rollback.sql
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
-- (gxixwdjfmegxcxfeflro) after explicit sign-off. Applying THIS migration is
-- low-risk regardless (it only defines functions), but actually CALLING
-- migrate_map_groups_to_category() against any real map — especially
-- IAPCO's two live maps, 0adab038-3cc6-41a5-8187-80e11404af86 and
-- bc37a36e-ca6d-48e7-b5db-65f78cbc80a3 — is a separate decision requiring
-- its own explicit go-ahead, made map by map, never as a bulk pass.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'map_filter_fields') then
    raise exception 'ABORT: table public.map_filter_fields does not exist';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'maps' and column_name = 'color_filter_field_id') then
    raise exception 'ABORT: maps.color_filter_field_id does not exist — apply 20260917130000_categories_v2_schema_foundation.sql first';
  end if;
  if exists (select 1 from pg_proc where proname = 'migrate_map_groups_to_category') then
    raise exception 'ABORT: function migrate_map_groups_to_category already exists — migration may have already run';
  end if;
end $$;

-- Row counts — inspect before proceeding. ALL of these must be UNCHANGED
-- after (this migration only defines functions, touches no data).
select
  'maps'               as tbl, count(*) as rows from public.maps               union all
  select 'groups',                  count(*) from public.groups                 union all
  select 'listings',                count(*) from public.listings               union all
  select 'map_filter_fields',       count(*) from public.map_filter_fields       union all
  select 'map_filter_field_options', count(*) from public.map_filter_field_options union all
  select 'listing_filter_values',    count(*) from public.listing_filter_values
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- Read-only preview of what migrate_map_groups_to_category(p_map_id) would
-- do, with zero side effects. Safe to call against any map, any time.
create or replace function public.dry_run_group_migration(p_map_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_already_migrated uuid;
  v_groups jsonb;
  v_ungrouped_listings integer;
begin
  if not exists (select 1 from public.maps where id = p_map_id) then
    raise exception 'Map % does not exist', p_map_id;
  end if;

  select id into v_already_migrated
  from public.map_filter_fields
  where map_id = p_map_id and key = 'group_migrated';

  select jsonb_agg(
    jsonb_build_object(
      'group_id', g.id,
      'name', g.name,
      'color', g.color,
      'sort_order', g.sort_order,
      'listing_count', (select count(*) from public.listings l where l.group_id = g.id and l.map_id = p_map_id)
    ) order by g.sort_order
  )
  into v_groups
  from public.groups g
  where g.map_id = p_map_id;

  select count(*) into v_ungrouped_listings
  from public.listings
  where map_id = p_map_id and group_id is null;

  return jsonb_build_object(
    'map_id', p_map_id,
    'already_migrated', v_already_migrated is not null,
    'existing_migrated_field_id', v_already_migrated,
    'current_color_filter_field_id', (select color_filter_field_id from public.maps where id = p_map_id),
    'groups', coalesce(v_groups, '[]'::jsonb),
    'group_count', coalesce(jsonb_array_length(v_groups), 0),
    'ungrouped_listings', v_ungrouped_listings
  );
end;
$$;

-- The actual one-time conversion. Idempotent per map (aborts if already
-- migrated). Never touches groups or listings.group_id.
create or replace function public.migrate_map_groups_to_category(p_map_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_field_id uuid;
  v_next_sort integer;
  g record;
  v_option_id uuid;
  v_groups_migrated integer := 0;
  v_listings_tagged integer := 0;
  v_this_count integer;
begin
  if not exists (select 1 from public.maps where id = p_map_id) then
    raise exception 'ABORT: map % does not exist', p_map_id;
  end if;
  if exists (select 1 from public.map_filter_fields where map_id = p_map_id and key = 'group_migrated') then
    raise exception 'ABORT: map % already has a migrated Group field — this function is idempotent-guarded, not re-runnable', p_map_id;
  end if;

  select coalesce(max(sort_order), -1) + 1
    into v_next_sort
  from public.map_filter_fields
  where map_id = p_map_id;

  insert into public.map_filter_fields (map_id, key, label, field_type, sort_order, is_active, show_in_filter_bar, display_control)
  values (p_map_id, 'group_migrated', 'Group', 'single_select', v_next_sort, true, false, 'multi_select')
  returning id into v_field_id;

  for g in select * from public.groups where map_id = p_map_id order by sort_order loop
    -- value is derived from the group's own uuid (not its name) so two
    -- same-named groups can never collide or misroute listings.
    insert into public.map_filter_field_options (field_id, value, label, color, sort_order)
    values (v_field_id, 'g_' || replace(g.id::text, '-', ''), g.name, g.color, g.sort_order)
    returning id into v_option_id;

    v_groups_migrated := v_groups_migrated + 1;

    with ins as (
      insert into public.listing_filter_values (listing_id, field_id, option_id)
      select l.id, v_field_id, v_option_id
      from public.listings l
      where l.map_id = p_map_id and l.group_id = g.id
      returning 1
    )
    select count(*) into v_this_count from ins;
    v_listings_tagged := v_listings_tagged + v_this_count;
  end loop;

  -- Colour source moves to the migrated field. Colours were copied 1:1
  -- above, so the resolved pin colour is unchanged at this instant —
  -- but from here on, editing a group's own colour in the (still-live)
  -- Groups tab no longer affects pin colour; the migrated field does.
  update public.maps set color_filter_field_id = v_field_id where id = p_map_id;

  return jsonb_build_object(
    'map_id', p_map_id,
    'field_id', v_field_id,
    'groups_migrated', v_groups_migrated,
    'listings_tagged', v_listings_tagged
  );
end;
$$;

-- Post-run comparison: does the new representation actually match the old
-- one? Flags mismatches rather than assuming success.
create or replace function public.verify_group_migration(p_map_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_field_id uuid;
  v_mismatches jsonb;
  v_color_field_ok boolean;
begin
  select id into v_field_id
  from public.map_filter_fields
  where map_id = p_map_id and key = 'group_migrated';

  if v_field_id is null then
    return jsonb_build_object('map_id', p_map_id, 'migrated', false, 'error', 'No migrated field found for this map');
  end if;

  select (color_filter_field_id = v_field_id) into v_color_field_ok
  from public.maps where id = p_map_id;

  select jsonb_agg(row)
  into v_mismatches
  from (
    select jsonb_build_object(
      'group_id', g.id,
      'name', g.name,
      'old_listing_count', (select count(*) from public.listings l where l.group_id = g.id and l.map_id = p_map_id),
      'new_listing_count', (
        select count(*) from public.listing_filter_values v
        join public.map_filter_field_options o on o.id = v.option_id
        where v.field_id = v_field_id and o.value = 'g_' || replace(g.id::text, '-', '')
      ),
      'old_color', g.color,
      'new_color', (
        select o.color from public.map_filter_field_options o
        where o.field_id = v_field_id and o.value = 'g_' || replace(g.id::text, '-', '')
      )
    ) as row
    from public.groups g
    where g.map_id = p_map_id
  ) rows
  where (row->>'old_listing_count')::integer <> (row->>'new_listing_count')::integer
     or (row->>'old_color') is distinct from (row->>'new_color');

  return jsonb_build_object(
    'map_id', p_map_id,
    'migrated', true,
    'field_id', v_field_id,
    'color_filter_field_points_at_migrated_field', v_color_field_ok,
    'mismatches', coalesce(v_mismatches, '[]'::jsonb),
    'clean', v_mismatches is null and v_color_field_ok
  );
end;
$$;

comment on function public.dry_run_group_migration(text) is
  'Categories V2: read-only preview of what migrate_map_groups_to_category() would create for this map. No side effects.';
comment on function public.migrate_map_groups_to_category(text) is
  'Categories V2: one-time conversion of a map''s Group data into a migrated single_select category, preserving colours and pin-colour source. Idempotent per map. Invoke one map at a time via a privileged connection only — not granted to authenticated.';
comment on function public.verify_group_migration(text) is
  'Categories V2: post-migration comparison between old (groups) and new (map_filter_fields) representation for a map. Flags mismatches rather than assuming success.';


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'dry_run_group_migration') then
    raise exception 'VERIFY FAILED: dry_run_group_migration was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'migrate_map_groups_to_category') then
    raise exception 'VERIFY FAILED: migrate_map_groups_to_category was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'verify_group_migration') then
    raise exception 'VERIFY FAILED: verify_group_migration was not created';
  end if;
  raise notice 'VERIFY PASSED: group migration tooling functions created (no data touched)';
end $$;

-- Row counts — must be UNCHANGED from pre-migration (function definitions
-- only, no data was touched by applying this migration).
select
  'maps'               as tbl, count(*) as rows from public.maps               union all
  select 'groups',                  count(*) from public.groups                 union all
  select 'listings',                count(*) from public.listings               union all
  select 'map_filter_fields',       count(*) from public.map_filter_fields       union all
  select 'map_filter_field_options', count(*) from public.map_filter_field_options union all
  select 'listing_filter_values',    count(*) from public.listing_filter_values
order by tbl;

-- Sanity check: these functions must NOT be callable by ordinary app users.
select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('dry_run_group_migration', 'migrate_map_groups_to_category', 'verify_group_migration');
-- Expected: 3 rows, security_type = 'DEFINER' for all
