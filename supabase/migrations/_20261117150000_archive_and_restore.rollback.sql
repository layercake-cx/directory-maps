-- ============================================================
-- Rollback: 20261117150000_archive_and_restore
-- Reverses: archive columns, helpers, RLS changes, resolver is_live column
-- ============================================================

-- PRE-ROLLBACK CHECK
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'maps' and column_name = 'is_active') then
    raise exception 'ABORT: maps.is_active does not exist — nothing to roll back';
  end if;
  -- Safety: archived state would be lost. Restore everything first (or delete this check if the data can go).
  if exists (select 1 from public.maps where not is_active)
     or exists (select 1 from public.clients where not is_active)
     or exists (select 1 from public.directories where archived_at is not null) then
    raise exception 'ABORT: archived maps/customers/directories exist — restore them before rolling back, or this check can be removed to discard the archive flags';
  end if;
end $$;

-- Policies back to their pre-archive definitions.
drop policy if exists "Clients manage their own maps" on public.maps;
create policy "Clients manage their own maps" on public.maps for all to authenticated
  using (client_id in (select contacts.client_id from public.contacts where contacts.user_id = auth.uid()))
  with check (client_id in (select contacts.client_id from public.contacts where contacts.user_id = auth.uid()));

drop policy if exists maps_anon_select on public.maps;
create policy maps_anon_select on public.maps for select to anon using (true);

drop policy if exists groups_anon_select on public.groups;
create policy groups_anon_select on public.groups for select to anon using (true);

drop policy if exists listings_anon_select on public.listings;
create policy listings_anon_select on public.listings for select to anon using (true);

drop policy if exists map_publications_select_current_for_map on public.map_publications;
create policy map_publications_select_current_for_map on public.map_publications for select to anon, authenticated
  using (exists (select 1 from public.maps m where m.id = map_publications.map_id and m.current_publication_id = map_publications.id));

drop policy if exists directories_anon_select on public.directories;
create policy directories_anon_select on public.directories for select to anon
  using (current_publication_id is not null);

drop policy if exists directory_entries_anon_select on public.directory_entries;
create policy directory_entries_anon_select on public.directory_entries for select to anon
  using (is_active = true and exists (select 1 from public.directories d
         where d.id = directory_entries.directory_id and d.current_publication_id is not null));

create or replace function public.current_user_client_id()
returns text language sql security definer stable set search_path = public
as $$ select client_id from public.contacts where user_id = auth.uid() limit 1; $$;

drop function if exists public.resolve_custom_domain(text);
create function public.resolve_custom_domain(p_hostname text)
returns table(entity_type text, client_slug text, entity_slug text, status text)
language sql security definer stable set search_path = public
as $$
  select 'map'::text, c.slug, m.slug, cd.status
  from public.client_domains cd
  join public.clients c on c.id = cd.client_id
  join public.maps m on m.id = cd.map_id
  where cd.map_id is not null and lower(cd.hostname) = lower(p_hostname)
  union all
  select 'directory'::text, c.slug, d.slug, cd.status
  from public.client_domains cd
  join public.clients c on c.id = cd.client_id
  join public.directories d on d.id = cd.directory_id
  where cd.directory_id is not null and lower(cd.hostname) = lower(p_hostname)
  limit 1;
$$;
revoke all on function public.resolve_custom_domain(text) from public;
grant execute on function public.resolve_custom_domain(text) to anon, authenticated, service_role;

drop function if exists public.my_client_is_archived();
drop function if exists public.entity_status_by_slug(text, text, text);
drop function if exists public.entity_status(text, text);
drop function if exists public.is_entity_live(text, text);

-- Columns last (the policies above no longer reference them). Allowed here only because of the safety check.
alter table public.directories drop column if exists archived_by, drop column if exists archived_at;
alter table public.clients drop column if exists archived_by, drop column if exists archived_at, drop column if exists is_active;
alter table public.maps drop column if exists archived_by, drop column if exists archived_at, drop column if exists is_active;

-- POST-ROLLBACK VERIFICATION
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'maps' and column_name = 'is_active') then
    raise exception 'ROLLBACK VERIFY FAILED: maps.is_active still exists';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
