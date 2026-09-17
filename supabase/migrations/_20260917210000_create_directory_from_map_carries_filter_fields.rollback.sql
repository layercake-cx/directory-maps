-- ============================================================
-- Rollback: 20260917210000_create_directory_from_map_carries_filter_fields
-- Reverses: restores create_directory_from_map() to its original body
--           (groups/listings copy only, no categorisation migration).
-- ============================================================
--
-- Note: this does NOT undo any categorisations/terms/attachments/tags
-- already created by directories built while the fixed version was live —
-- those rows are left in place (harmless, additive data). This only
-- reverts the function's behaviour for FUTURE calls.

do $$
begin
  if not exists (select 1 from information_schema.routines where routine_schema = 'public' and routine_name = 'create_directory_from_map') then
    raise exception 'ABORT: create_directory_from_map() does not exist — nothing to roll back';
  end if;
end $$;

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
  v_map           public.maps%rowtype;
  v_dir           public.directories%rowtype;
  v_dir_id        text := gen_random_uuid()::text;
  v_name          text;
  v_slug          text;
  v_candidate     text;
  v_suffix        integer := 1;
  v_group_map     jsonb := '{}'::jsonb;
  v_new_group_id  uuid;
  r               record;
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
    insert into public.directory_entries (
      id, directory_id, directory_group_id, name, address, postcode, country, city,
      lat, lng, is_active, website_url, email, phone, logo_url, notes_html, allow_html,
      geocode_status, source
    ) values (
      gen_random_uuid()::text, v_dir_id,
      case when r.group_id is not null then (v_group_map ->> r.group_id::text)::uuid else null end,
      r.name, r.address, r.postcode, r.country, r.city,
      r.lat, r.lng, r.is_active, r.website_url, r.email, r.phone, r.logo_url, r.notes_html, r.allow_html,
      r.geocode_status, 'map_import'
    );
  end loop;

  return v_dir;
end;
$$;

comment on function public.create_directory_from_map(text, text, text) is
  'Copies a map''s groups and listings into a brand-new directory (source = ''map_import'' on the copied entries). Does not publish the directory or attach it back to the map as a datasource — those are separate, visible steps (publish_directory, attach_directory_to_map). Does not touch or delete the source map''s own listings/groups.';

do $$
begin
  raise notice 'ROLLBACK APPLIED: create_directory_from_map() reverted to groups/listings-only copy (no categorisation migration)';
end $$;
