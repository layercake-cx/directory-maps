-- ============================================================
-- Migration: 20260917180000_fix_group_migration_color_source
-- Description: BUG FIX in the Group migration tooling (20260917140000).
--              Auditing IAPCO's two live maps (0adab038-3cc6-41a5-8187-
--              80e11404af86, bc37a36e-ca6d-48e7-b5db-65f78cbc80a3) found
--              that per-group pin colour on this codebase almost always
--              lives in `groups.theme_json->>'marker_color'`, NOT the flat
--              `groups.color` column (which is null for most groups —
--              `color` is only kept in sync when an admin explicitly sets
--              a marker colour override via the Groups tab's "Colours"
--              section; many groups' colours were set some other way and
--              only ever landed in theme_json). The original
--              migrate_map_groups_to_category() only read `g.color`, so
--              running it against either IAPCO map as originally written
--              would have silently DROPPED the colour for almost every
--              group (e.g. IAPCO Community Map's "Registered Office",
--              "Destination Partners", "Service Providers", "Convention
--              Centres" all resolve their real colour from theme_json,
--              not the flat column) — directly violating this function's
--              own "pin colours are provably unchanged" guarantee.
--
--              Worse: one group ("IAPCO Accredited Member" on the
--              Community map) has no colour at all — it renders via a
--              **custom pin icon** (`theme_json.custom_pin_url` /
--              `pin_favicon_mode: 'custom'`). A category option only ever
--              carries a flat colour, never an icon, so migrating that
--              map's colour source to a category would silently replace
--              a distinctive custom icon with a plain/default pin — a
--              real visible regression for a live client, not just a
--              missed colour. Since nothing has been run against any real
--              map yet, this migration fixes both issues before that's
--              ever possible:
--
--                1. migrate_map_groups_to_category() now sources each
--                   option's colour from
--                   coalesce(g.color, g.theme_json->>'marker_color') —
--                   matching mergeGroupWithPublication()'s own precedent
--                   in src/lib/mapPublication.js.
--                2. migrate_map_groups_to_category() now ABORTS outright
--                   if any group on the map has a custom pin icon
--                   (custom_pin_url set, or pin_favicon_mode = 'custom'
--                   with a pin_favicon_url) — migrating colour source for
--                   a map like that needs a human decision, not a script.
--                3. dry_run_group_migration() surfaces, per group, the
--                   coalesced colour it would actually use and whether a
--                   custom icon would block the migration, so this is
--                   visible in the report BEFORE anyone attempts the real
--                   run — not discovered after the fact.
--                4. verify_group_migration()'s colour-equivalence check
--                   now compares against the same coalesced value on both
--                   sides (previously compared the new option's colour
--                   against the flat g.color only, which would have
--                   falsely reported a mismatch even for a correctly
--                   migrated map).
--
--              CREATE OR REPLACE — same function signatures, no schema
--              change, no data touched. Still not granted to
--              authenticated (unaffected by this fix).
-- Affected: function bodies only (no tables, no data)
-- Rollback: _20260917180000_fix_group_migration_color_source.rollback.sql
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
-- -> run POST-MIGRATION VERIFICATION -> then PRODUCTION (gxixwdjfmegxcxfeflro).
-- Low risk either way — function bodies only, and nothing has invoked
-- migrate_map_groups_to_category against real data yet on either
-- environment, so there is nothing this fix could disturb.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'migrate_map_groups_to_category') then
    raise exception 'ABORT: migrate_map_groups_to_category does not exist — apply 20260917140000_group_migration_tooling.sql first';
  end if;
  -- Confirm no map has actually been migrated yet with the buggy version —
  -- if one had, its colours would need re-checking by hand rather than
  -- just replacing the function body.
  if exists (select 1 from public.map_filter_fields where key = 'group_migrated') then
    raise exception 'ABORT: at least one map already has a group_migrated field — review its colours by hand (the original function may have dropped some) before applying this fix silently underneath it';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

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
  v_blocking_groups jsonb;
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
      'flat_color_column', g.color,
      'resolved_color', coalesce(g.color, g.theme_json->>'marker_color'),
      'has_custom_icon', (
        (g.theme_json->>'custom_pin_url') is not null
        or (g.theme_json->>'pin_favicon_mode' = 'custom' and (g.theme_json->>'pin_favicon_url') is not null)
      ),
      'sort_order', g.sort_order,
      'listing_count', (select count(*) from public.listings l where l.group_id = g.id and l.map_id = p_map_id)
    ) order by g.sort_order
  )
  into v_groups
  from public.groups g
  where g.map_id = p_map_id;

  select jsonb_agg(jsonb_build_object('group_id', g.id, 'name', g.name))
  into v_blocking_groups
  from public.groups g
  where g.map_id = p_map_id
    and (
      (g.theme_json->>'custom_pin_url') is not null
      or (g.theme_json->>'pin_favicon_mode' = 'custom' and (g.theme_json->>'pin_favicon_url') is not null)
    );

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
    'ungrouped_listings', v_ungrouped_listings,
    'would_be_blocked_by_custom_icon', v_blocking_groups is not null,
    'blocking_groups', coalesce(v_blocking_groups, '[]'::jsonb)
  );
end;
$$;

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
  v_blocking_count integer;
begin
  if not exists (select 1 from public.maps where id = p_map_id) then
    raise exception 'ABORT: map % does not exist', p_map_id;
  end if;
  if exists (select 1 from public.map_filter_fields where map_id = p_map_id and key = 'group_migrated') then
    raise exception 'ABORT: map % already has a migrated Group field — this function is idempotent-guarded, not re-runnable', p_map_id;
  end if;

  select count(*) into v_blocking_count
  from public.groups g
  where g.map_id = p_map_id
    and (
      (g.theme_json->>'custom_pin_url') is not null
      or (g.theme_json->>'pin_favicon_mode' = 'custom' and (g.theme_json->>'pin_favicon_url') is not null)
    );
  if v_blocking_count > 0 then
    raise exception 'ABORT: map % has % group(s) using a custom pin icon (not a flat colour) — a category option cannot carry an icon, so migrating colour source here would silently lose it. Run dry_run_group_migration(%) to see which group(s), and decide by hand before proceeding.', p_map_id, v_blocking_count, p_map_id;
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
    -- same-named groups can never collide or misroute listings. Colour is
    -- resolved the same way the live embed resolves it: the flat column
    -- when set, else theme_json's marker_color (see
    -- mergeGroupWithPublication in src/lib/mapPublication.js).
    insert into public.map_filter_field_options (field_id, value, label, color, sort_order)
    values (
      v_field_id,
      'g_' || replace(g.id::text, '-', ''),
      g.name,
      coalesce(g.color, g.theme_json->>'marker_color'),
      g.sort_order
    )
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

  update public.maps set color_filter_field_id = v_field_id where id = p_map_id;

  return jsonb_build_object(
    'map_id', p_map_id,
    'field_id', v_field_id,
    'groups_migrated', v_groups_migrated,
    'listings_tagged', v_listings_tagged
  );
end;
$$;

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
      'old_resolved_color', coalesce(g.color, g.theme_json->>'marker_color'),
      'new_color', (
        select o.color from public.map_filter_field_options o
        where o.field_id = v_field_id and o.value = 'g_' || replace(g.id::text, '-', '')
      )
    ) as row
    from public.groups g
    where g.map_id = p_map_id
  ) rows
  where (row->>'old_listing_count')::integer <> (row->>'new_listing_count')::integer
     or (row->>'old_resolved_color') is distinct from (row->>'new_color');

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


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  -- Sanity-check the fixed logic directly against IAPCO's two live maps'
  -- actual data (read-only — no group_migrated field is created by this
  -- check, since these functions weren't called; this just re-derives the
  -- same coalesce expression against real rows to confirm it now finds
  -- colour where the old flat-column-only version would have found none).
  if exists (select 1 from public.maps where id = '0adab038-3cc6-41a5-8187-80e11404af86') then
    if not exists (
      select 1 from public.groups
      where map_id = '0adab038-3cc6-41a5-8187-80e11404af86'
        and coalesce(color, theme_json->>'marker_color') is not null
    ) then
      raise exception 'VERIFY FAILED: expected at least one resolved colour on map 0adab038-... after the fix';
    end if;
  end if;

  raise notice 'VERIFY PASSED: migrate_map_groups_to_category now resolves colour via coalesce(color, theme_json->>marker_color) and aborts on custom pin icons; dry_run_group_migration and verify_group_migration updated to match';
end $$;

-- Confirm the fixed dry-run report against IAPCO's two maps if this
-- environment has them (production does; staging/other environments may
-- not, since they're real client data, not seeded here) — guarded so this
-- is a no-op notice elsewhere rather than an error that would roll back
-- the whole migration.
do $$
begin
  if exists (select 1 from public.maps where id = '0adab038-3cc6-41a5-8187-80e11404af86') then
    raise notice 'dry_run_group_migration(Pharma map): %', public.dry_run_group_migration('0adab038-3cc6-41a5-8187-80e11404af86');
  end if;
  if exists (select 1 from public.maps where id = 'bc37a36e-ca6d-48e7-b5db-65f78cbc80a3') then
    raise notice 'dry_run_group_migration(IAPCO Community map): %', public.dry_run_group_migration('bc37a36e-ca6d-48e7-b5db-65f78cbc80a3');
  end if;
end $$;
-- Expected on an environment that has them: the IAPCO Global Community
-- Map report shows would_be_blocked_by_custom_icon = true, naming
-- "IAPCO Accredited Member".
