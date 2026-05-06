-- Versioned map publications: immutable snapshots for embed (config + per-group styling).
-- Listings remain live; anon may only read the publication row currently pointed to by maps.current_publication_id.

create table if not exists public.map_publications (
  id uuid primary key default gen_random_uuid(),
  map_id text not null references public.maps (id) on delete cascade,
  version integer not null,
  config jsonb not null,
  note text null,
  published_at timestamptz not null default now(),
  published_by uuid null references auth.users (id),
  unique (map_id, version)
);

create index if not exists idx_map_publications_map_id_version_desc
  on public.map_publications (map_id, version desc);

alter table public.maps
  add column if not exists current_publication_id uuid null;

comment on column public.maps.current_publication_id is
  'Points at the active publication row for embeds; no FK to avoid circular dependency with map_publications.';

alter table public.map_publications enable row level security;

-- Embeds (anon or authenticated JWT): only the publication currently live for the map.
-- Full history is exposed via list_map_publications() for authenticated dashboard users.
create policy map_publications_select_current_for_map
  on public.map_publications for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.maps m
      where m.id = map_publications.map_id
        and m.current_publication_id = map_publications.id
    )
  );

-- ---------------------------------------------------------------------------
-- Backfill: maps that already have published_config become version 1.
-- ---------------------------------------------------------------------------
insert into public.map_publications (map_id, version, config, published_at)
select
  m.id,
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'map', coalesce(m.published_config, '{}'::jsonb),
    'groups', jsonb_build_object(
      'byId', '{}'::jsonb,
      'byName', '{}'::jsonb
    )
  ),
  coalesce(m.published_at, now())
from public.maps m
where m.published_config is not null
  and not exists (
    select 1 from public.map_publications p where p.map_id = m.id
  );

update public.maps m
set current_publication_id = p.id
from public.map_publications p
where p.map_id = m.id
  and p.version = 1
  and m.published_config is not null
  and m.current_publication_id is null;

-- ---------------------------------------------------------------------------
-- RPC: publish (client sends full config snapshot — matches unsaved form state).
-- ---------------------------------------------------------------------------
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
  v_pub public.map_publications%rowtype;
  v_note text;
begin
  if not exists (select 1 from public.maps where id = p_map_id) then
    raise exception 'Map not found';
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
    published_config = p_config->'map',
    published_at = v_pub.published_at
  where id = p_map_id;

  return v_pub;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: rollback — append-only history (new row copies old config).
-- ---------------------------------------------------------------------------
create or replace function public.rollback_map_to(
  p_map_id text,
  p_publication_id uuid
)
returns public.map_publications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.map_publications%rowtype;
  v_next_ver integer;
  v_pub public.map_publications%rowtype;
begin
  if not exists (select 1 from public.maps where id = p_map_id) then
    raise exception 'Map not found';
  end if;

  select * into v_src
  from public.map_publications
  where id = p_publication_id
    and map_id = p_map_id;

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
    published_config = v_pub.config->'map',
    published_at = v_pub.published_at
  where id = p_map_id;

  return v_pub;
end;
$$;

revoke all on function public.publish_map(text, jsonb, text) from public;
revoke all on function public.rollback_map_to(text, uuid) from public;

grant execute on function public.publish_map(text, jsonb, text) to authenticated;
grant execute on function public.rollback_map_to(text, uuid) to authenticated;

-- Dashboard publish history (same broad trust model as maps_authenticated_all).
create or replace function public.list_map_publications(p_map_id text)
returns setof public.map_publications
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.map_publications
  where map_id = p_map_id
  order by version desc;
$$;

revoke all on function public.list_map_publications(text) from public;
grant execute on function public.list_map_publications(text) to authenticated;
