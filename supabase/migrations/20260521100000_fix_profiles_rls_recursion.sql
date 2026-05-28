-- Fix: infinite recursion detected in policy for relation "profiles"
--
-- profiles_admin_select (and other policies) used:
--   exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
-- That subquery re-triggers profiles RLS → infinite recursion.
--
-- Use a security-definer helper (same pattern as current_user_client_id).

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- PROFILES
drop policy if exists "profiles_admin_select" on public.profiles;

create policy "profiles_admin_select"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- CLIENTS
drop policy if exists "clients_admin_all" on public.clients;
create policy "clients_admin_all"
  on public.clients for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- MAPS
drop policy if exists "maps_admin_all" on public.maps;
create policy "maps_admin_all"
  on public.maps for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- GROUPS
drop policy if exists "groups_admin_all" on public.groups;
create policy "groups_admin_all"
  on public.groups for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- LISTINGS
drop policy if exists "listings_admin_all" on public.listings;
create policy "listings_admin_all"
  on public.listings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- CONTACTS
drop policy if exists "contacts_admin_all" on public.contacts;
create policy "contacts_admin_all"
  on public.contacts for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- MAP_DATA_SOURCES
drop policy if exists "mds_admin_all" on public.map_data_sources;
create policy "mds_admin_all"
  on public.map_data_sources for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- INVITATIONS
drop policy if exists "invitations_admin_all" on public.invitations;
create policy "invitations_admin_all"
  on public.invitations for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- CONTACT_MAP_PERMISSIONS
drop policy if exists "cmp_admin_all" on public.contact_map_permissions;
create policy "cmp_admin_all"
  on public.contact_map_permissions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- MAP_PUBLICATIONS
drop policy if exists "map_publications_admin_all" on public.map_publications;
create policy "map_publications_admin_all"
  on public.map_publications for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- MAP_CONTACT_SUBMISSIONS (admin branch of insert policy)
drop policy if exists "map_contact_submissions_authenticated_insert" on public.map_contact_submissions;
create policy "map_contact_submissions_authenticated_insert"
  on public.map_contact_submissions for insert
  to authenticated
  with check (
    public.is_admin()
    or map_id in (
      select id from public.maps where client_id = public.current_user_client_id()
    )
  );

-- MAP_ENGAGEMENT_EVENTS
drop policy if exists "map_engagement_authenticated_select" on public.map_engagement_events;
create policy "map_engagement_authenticated_select"
  on public.map_engagement_events for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.maps m
      join public.contacts c on c.client_id = m.client_id and c.user_id = auth.uid()
      where m.id = map_engagement_events.map_id
        and (
          c.role in ('owner', 'manager')
          or exists (
            select 1 from public.contact_map_permissions cmp
            where cmp.contact_id = c.id and cmp.map_id = m.id
          )
        )
    )
  );

-- MAP_CONTACT_SUBMISSIONS (select for reporting)
drop policy if exists "map_contact_submissions_authenticated_select" on public.map_contact_submissions;
create policy "map_contact_submissions_authenticated_select"
  on public.map_contact_submissions for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.maps m
      join public.contacts c on c.client_id = m.client_id and c.user_id = auth.uid()
      where m.id = map_contact_submissions.map_id
        and (
          c.role in ('owner', 'manager')
          or exists (
            select 1 from public.contact_map_permissions cmp
            where cmp.contact_id = c.id and cmp.map_id = m.id
          )
        )
    )
  );

-- ERROR_LOGS
drop policy if exists "error_logs_select_admin" on public.error_logs;
create policy "error_logs_select_admin"
  on public.error_logs for select
  to authenticated
  using (public.is_admin());

-- Security-definer RPCs: use is_admin() for clarity (definer already bypasses RLS on read)
create or replace function public.publish_map(
  p_map_id text,
  p_config jsonb,
  p_note text default null
)
returns public.map_publications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_ver integer;
  v_pub      public.map_publications%rowtype;
  v_note     text;
  v_client   text;
begin
  select client_id into v_client from public.maps where id = p_map_id;
  if not found then
    raise exception 'Map not found';
  end if;

  if not (
    public.is_admin()
    or exists (select 1 from public.contacts where user_id = auth.uid() and client_id = v_client)
  ) then
    raise exception 'Access denied';
  end if;

  if coalesce((p_config->>'schemaVersion')::integer, 0) <> 1 then
    raise exception 'Invalid publication config: schemaVersion must be 1';
  end if;
  if p_config->'map' is null then
    raise exception 'Invalid publication config: missing map';
  end if;
  if p_config->'groups' is null then
    raise exception 'Invalid publication config: missing groups';
  end if;

  select coalesce(max(version), 0) + 1
    into v_next_ver
  from public.map_publications
  where map_id = p_map_id;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  insert into public.map_publications (map_id, version, config, note, published_by)
  values (p_map_id, v_next_ver, p_config, v_note, auth.uid())
  returning * into v_pub;

  update public.maps
  set
    current_publication_id = v_pub.id,
    published_config       = p_config->'map',
    published_at           = v_pub.published_at
  where id = p_map_id;

  return v_pub;
end;
$$;

create or replace function public.rollback_map_to(
  p_map_id        text,
  p_publication_id uuid
)
returns public.map_publications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src      public.map_publications%rowtype;
  v_next_ver integer;
  v_pub      public.map_publications%rowtype;
  v_client   text;
begin
  select client_id into v_client from public.maps where id = p_map_id;
  if not found then
    raise exception 'Map not found';
  end if;

  if not (
    public.is_admin()
    or exists (select 1 from public.contacts where user_id = auth.uid() and client_id = v_client)
  ) then
    raise exception 'Access denied';
  end if;

  select * into v_src
  from public.map_publications
  where id = p_publication_id and map_id = p_map_id;

  if not found then
    raise exception 'Publication not found for this map';
  end if;

  select coalesce(max(version), 0) + 1
    into v_next_ver
  from public.map_publications
  where map_id = p_map_id;

  insert into public.map_publications (map_id, version, config, note, published_by)
  values (
    p_map_id,
    v_next_ver,
    v_src.config,
    format('Restore version %s', v_src.version),
    auth.uid()
  )
  returning * into v_pub;

  update public.maps
  set
    current_publication_id = v_pub.id,
    published_config       = v_pub.config->'map',
    published_at           = v_pub.published_at
  where id = p_map_id;

  return v_pub;
end;
$$;

create or replace function public.list_map_publications(p_map_id text)
returns setof public.map_publications
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_client text;
begin
  select client_id into v_client from public.maps where id = p_map_id;
  if not found then
    raise exception 'Map not found';
  end if;

  if not (
    public.is_admin()
    or exists (select 1 from public.contacts where user_id = auth.uid() and client_id = v_client)
  ) then
    raise exception 'Access denied';
  end if;

  return query
    select * from public.map_publications
    where map_id = p_map_id
    order by version desc;
end;
$$;
