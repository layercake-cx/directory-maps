-- ============================================================
-- Rollback: 20260917180000_fix_group_migration_color_source
-- Reverses: the colour-source fix, restoring the original (buggy)
--           function bodies from 20260917140000_group_migration_tooling.
-- ============================================================
--
-- Reverting this brings back a known bug (colour read from the flat
-- groups.color column only, ignoring theme_json.marker_color, and no
-- guard against custom pin icons). Only run this if you are certain that
-- is intended.

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'migrate_map_groups_to_category') then
    raise exception 'ABORT: migrate_map_groups_to_category does not exist — nothing to roll back';
  end if;
  if exists (select 1 from public.map_filter_fields where key = 'group_migrated') then
    raise exception 'ABORT: at least one map already has a group_migrated field — do not restore the buggy colour-source logic underneath it without reviewing that map''s data by hand first';
  end if;
end $$;

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

do $$
begin
  raise notice 'ROLLBACK APPLIED: migrate_map_groups_to_category reverted to flat-color-only logic (bug restored — confirm this was truly intended)';
end $$;
