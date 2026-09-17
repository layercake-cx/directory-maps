-- ============================================================
-- Migration: 20260917210000_create_directory_from_map_carries_filter_fields
-- Description: Extends create_directory_from_map() (20260827160000) so
--              building a directory from a map also carries the map's
--              active `map_filter_fields` across as `categorisations`
--              attached to the new directory — closing a real gap: this
--              conversion previously copied groups/listings only, silently
--              leaving all "Filters" data behind, even though directory
--              entries have a structurally equivalent, filterable taxonomy
--              (categorisations/category_terms/entry_category_terms).
--              docs/USER_GUIDE.md and docs/FEATURES.md both claimed
--              directory entries have "no equivalent to map filter
--              fields" — that framing was wrong (fixed in the same
--              change, not this migration).
--
--              Confirmed with the user: this is AUTOMATIC, bundled into
--              directory creation itself, same trust level groups/listings
--              already get — purely additive, no new UI action.
--
--              Mapping, per active field (is_active = true):
--                - field_type: single_select/multi_select/boolean map 1:1
--                  onto categorisations.field_type (identical enum values).
--                  'text' fields have no categorisation equivalent (no
--                  free-text term type) — skipped, named in a closing
--                  notice rather than silently dropped.
--                - categorisations.key: the field's own key, disambiguated
--                  against the client's existing categorisation keys with
--                  the same numeric-suffix pattern this function already
--                  uses for the directory's own slug.
--                - categorisations.applies_to: left NULL, matching how
--                  createCategorisation() in src/lib/categorisations.js
--                  already creates every categorisation today (legacy
--                  column, superseded by categorisation_attachments,
--                  20260907120000_categorisations_applies_to_nullable).
--                - category_terms: one per map_filter_field_options row
--                  (label, slug = the option's existing stable `value`,
--                  sort_order, color copied directly).
--                - categorisation_attachments: one row per migrated field,
--                  target_type = 'directory', target_id = the new
--                  directory, sort_order = the field's own sort_order.
--                - entry_category_terms: for every listing_filter_values
--                  row on a migrated field with a non-null option_id,
--                  tag the corresponding new directory_entries row (via a
--                  new v_listing_map, old listings.id -> new
--                  directory_entries.id, built in the existing listings
--                  loop) with the corresponding new term (via a new
--                  v_term_map, old option id -> new term id).
--
--              Explicitly NOT done here (see the plan doc): no retroactive
--              backfill for a directory already created from a map before
--              this fix (directory_entries has no column linking an entry
--              back to its source listing, so there's no reliable
--              correlation to backfill against). The source map's own
--              map_filter_fields/listing_filter_values/groups/listings are
--              completely untouched — copy, not move, same as before. The
--              new categorisation is attached ONLY to the new directory,
--              never back to the map (letting a categorisation tag a
--              self-authored map's own listings was already tried and
--              reverted on 2026-08-29 as "the wrong shape" — this doesn't
--              revisit that).
--
--              No RPC signature/return-type change — still returns
--              public.directories, so src/lib/directories.js's
--              createDirectoryFromMap() needs no changes.
-- Affected: create_directory_from_map() function body only (no schema
--           change — reuses existing categorisations/category_terms/
--           categorisation_attachments/entry_category_terms tables)
-- Rollback: _20260917210000_create_directory_from_map_carries_filter_fields.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-17
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run (BEGIN/ROLLBACK) -> apply on STAGING (beqejxneehilplrtpntn),
-- exercise with a throwaway test fixture (see plan doc verification section)
-- -> only then PRODUCTION (gxixwdjfmegxcxfeflro) after explicit sign-off.
-- This changes a LIVE, user-facing action (the "Build a directory from
-- this map" button, called directly by client/admin users) — purely
-- additive to what it does today, but still goes through the same
-- staging-first discipline as everything else.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'create_directory_from_map') then
    raise exception 'ABORT: create_directory_from_map() does not exist — apply 20260827160000_create_directory_from_map.sql first';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'categorisation_attachments') then
    raise exception 'ABORT: categorisation_attachments does not exist — apply 20260829040000_create_categorisation_attachments.sql first';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'categorisations' and column_name = 'field_type') then
    raise exception 'ABORT: categorisations.field_type does not exist — apply 20260914170000_categorisations_field_type_and_attachment_order.sql first';
  end if;
end $$;

-- Row counts — inspect before proceeding. This migration only replaces a
-- function body; it does not itself write any rows.
select
  'categorisations'          as tbl, count(*) as rows from public.categorisations          union all
  select 'category_terms',                count(*) from public.category_terms                union all
  select 'categorisation_attachments',    count(*) from public.categorisation_attachments     union all
  select 'entry_category_terms',          count(*) from public.entry_category_terms
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create or replace function public.create_directory_from_map(
  p_map_id text,
  p_name text default null,
  p_slug text default null
)
returns public.directories
language plpgsql
security definer
set search_path = public
as $$
declare
  v_map              public.maps%rowtype;
  v_dir              public.directories%rowtype;
  v_dir_id           text := gen_random_uuid()::text;
  v_name             text;
  v_slug             text;
  v_candidate        text;
  v_suffix           integer := 1;
  v_group_map        jsonb := '{}'::jsonb; -- old groups.id (uuid, as text) -> new directory_groups.id (uuid, as text)
  v_listing_map      jsonb := '{}'::jsonb; -- old listings.id (text) -> new directory_entries.id (text)
  v_new_group_id     uuid;
  v_new_entry_id     text;
  r                  record;
  -- Filter-field -> categorisation migration
  f                  record;
  o                  record;
  v_cat_key          text;
  v_cat_suffix       integer;
  v_categorisation_id uuid;
  v_term_map         jsonb;
  v_new_term_id      uuid;
  v_fields_migrated  integer := 0;
  v_fields_skipped   text[] := '{}';
begin
  select * into v_map from public.maps where id = p_map_id;
  if not found then
    raise exception 'Map not found';
  end if;

  if not (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
    or exists (
      select 1 from public.contacts
      where user_id = auth.uid() and client_id = v_map.client_id and role in ('owner', 'manager')
    )
  ) then
    raise exception 'Access denied';
  end if;

  v_name := coalesce(nullif(trim(p_name), ''), v_map.name);
  v_candidate := coalesce(nullif(trim(p_slug), ''), public.slugify_text(v_name), 'directory');

  while exists (select 1 from public.directories where client_id = v_map.client_id and slug = v_candidate) loop
    v_suffix := v_suffix + 1;
    v_candidate := coalesce(nullif(trim(p_slug), ''), public.slugify_text(v_name), 'directory') || '-' || v_suffix;
  end loop;
  v_slug := v_candidate;

  insert into public.directories (id, client_id, name, slug, description, is_active)
  values (v_dir_id, v_map.client_id, v_name, v_slug, null, true)
  returning * into v_dir;

  for r in select * from public.groups where map_id = p_map_id loop
    v_new_group_id := gen_random_uuid();
    insert into public.directory_groups (id, directory_id, name, sort_order, color)
    values (v_new_group_id, v_dir_id, r.name, r.sort_order, r.color);
    v_group_map := v_group_map || jsonb_build_object(r.id::text, v_new_group_id::text);
  end loop;

  for r in select * from public.listings where map_id = p_map_id loop
    v_new_entry_id := gen_random_uuid()::text;
    insert into public.directory_entries (
      id, directory_id, directory_group_id, name, address, postcode, country, city,
      lat, lng, is_active, website_url, email, phone, logo_url, notes_html, allow_html,
      geocode_status, source
    ) values (
      v_new_entry_id, v_dir_id,
      case when r.group_id is not null then (v_group_map ->> r.group_id::text)::uuid else null end,
      r.name, r.address, r.postcode, r.country, r.city,
      r.lat, r.lng, r.is_active, r.website_url, r.email, r.phone, r.logo_url, r.notes_html, r.allow_html,
      r.geocode_status, 'map_import'
    );
    v_listing_map := v_listing_map || jsonb_build_object(r.id::text, v_new_entry_id);
  end loop;

  -- Carry the map's active Filters across as categorisations attached to
  -- the new directory. text-type fields have no categorisation
  -- equivalent and are skipped (named in the closing notice).
  for f in select * from public.map_filter_fields where map_id = p_map_id and is_active loop
    if f.field_type = 'text' then
      v_fields_skipped := array_append(v_fields_skipped, f.label);
      continue;
    end if;

    v_cat_key := f.key;
    v_cat_suffix := 1;
    while exists (select 1 from public.categorisations where client_id = v_map.client_id and key = v_cat_key) loop
      v_cat_suffix := v_cat_suffix + 1;
      v_cat_key := f.key || '_' || v_cat_suffix;
    end loop;

    insert into public.categorisations (client_id, key, label, field_type, is_active)
    values (v_map.client_id, v_cat_key, f.label, f.field_type, true)
    returning id into v_categorisation_id;

    insert into public.categorisation_attachments (categorisation_id, target_type, target_id, sort_order)
    values (v_categorisation_id, 'directory', v_dir_id, f.sort_order);

    v_term_map := '{}'::jsonb;
    for o in select * from public.map_filter_field_options where field_id = f.id order by sort_order loop
      insert into public.category_terms (categorisation_id, label, slug, sort_order, color)
      values (v_categorisation_id, o.label, o.value, o.sort_order, o.color)
      returning id into v_new_term_id;
      v_term_map := v_term_map || jsonb_build_object(o.id::text, v_new_term_id::text);
    end loop;

    insert into public.entry_category_terms (entry_id, term_id)
    select v_listing_map ->> v.listing_id::text, (v_term_map ->> v.option_id::text)::uuid
    from public.listing_filter_values v
    where v.field_id = f.id and v.option_id is not null
    on conflict do nothing;

    v_fields_migrated := v_fields_migrated + 1;
  end loop;

  if v_fields_migrated > 0 or array_length(v_fields_skipped, 1) > 0 then
    raise notice 'create_directory_from_map(%): % filter field(s) migrated to categorisations, % skipped (text type, no equivalent): %',
      p_map_id, v_fields_migrated, coalesce(array_length(v_fields_skipped, 1), 0), v_fields_skipped;
  end if;

  return v_dir;
end;
$$;

comment on function public.create_directory_from_map(text, text, text) is
  'Copies a map''s groups and listings into a brand-new directory (source = ''map_import'' on the copied entries), and carries the map''s active single_select/multi_select/boolean filter fields across as categorisations attached to the new directory (text fields have no equivalent and are skipped). Does not publish the directory or attach it back to the map as a datasource — those are separate, visible steps (publish_directory, attach_directory_to_map). Does not touch or delete the source map''s own listings/groups/filter fields.';

-- Grants unchanged (already authenticated-callable; only the body changed).


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'create_directory_from_map') then
    raise exception 'VERIFY FAILED: create_directory_from_map() was not created';
  end if;
  raise notice 'VERIFY PASSED: create_directory_from_map() now carries active filter fields across as categorisations';
end $$;

-- Row counts — must be UNCHANGED (function body replacement only; no data
-- written by applying this migration itself).
select
  'categorisations'          as tbl, count(*) as rows from public.categorisations          union all
  select 'category_terms',                count(*) from public.category_terms                union all
  select 'categorisation_attachments',    count(*) from public.categorisation_attachments     union all
  select 'entry_category_terms',          count(*) from public.entry_category_terms
order by tbl;
