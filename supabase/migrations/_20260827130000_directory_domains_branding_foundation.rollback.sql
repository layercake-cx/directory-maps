-- ============================================================
-- Rollback: 20260827130000_directory_domains_branding_foundation
-- Reverses: directories.theme_json; client_domains.directory_id +
--           client_domains_one_entity + map_id nullability; recreates
--           resolve_custom_domain with its original map-only return shape.
-- ============================================================


-- ------------------------------------------------------------
-- PRE-ROLLBACK SAFETY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'client_domains' and column_name = 'directory_id') then
    raise exception 'ABORT: nothing to roll back — client_domains.directory_id does not exist';
  end if;

  -- Data-loss guard: any directory-backed domain would become constraint-
  -- violating (map_id NOT NULL, about to be restored) the moment its
  -- directory_id column is dropped. Refuse rather than silently orphan it.
  if exists (select 1 from public.client_domains where directory_id is not null) then
    raise exception 'ABORT: a client_domains row has directory_id set (a real directory custom domain exists). Reassign or remove it before rolling back — restoring map_id NOT NULL would otherwise leave this row invalid. To override, remove this check and re-run.';
  end if;

  if exists (select 1 from public.directories where theme_json is not null) then
    raise exception 'ABORT: a directories row has a non-null theme_json. Export it before rolling back. To override, remove this check and re-run.';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE ROLLBACK
-- ------------------------------------------------------------

drop function if exists public.resolve_custom_domain(text);

create function public.resolve_custom_domain(p_hostname text)
returns table(client_slug text, map_slug text, status text)
language sql
security definer
stable
set search_path = public
as $$
  select c.slug, m.slug, cd.status
  from public.client_domains cd
  join public.clients c on c.id = cd.client_id
  join public.maps m on m.id = cd.map_id
  where lower(cd.hostname) = lower(p_hostname)
  limit 1;
$$;

comment on function public.resolve_custom_domain(text) is
  'Resolves a hostname to the client/map slugs it publishes, for Vercel Edge Middleware host-based routing. Returns status regardless of value (pending/verifying/active/failed) so the caller can distinguish "not registered" from "registered but not live yet". Security definer — exposes only slugs + status, never other clients/maps columns, so it is safe to grant to anon.';

revoke all on function public.resolve_custom_domain(text) from public;
grant execute on function public.resolve_custom_domain(text) to anon, authenticated, service_role;

alter table public.client_domains drop constraint if exists client_domains_one_entity;
drop index if exists idx_client_domains_directory;
alter table public.client_domains drop column if exists directory_id;
alter table public.client_domains alter column map_id set not null;

alter table public.directories drop column if exists theme_json;


-- ------------------------------------------------------------
-- POST-ROLLBACK VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'client_domains' and column_name = 'directory_id') then
    raise exception 'ROLLBACK VERIFY FAILED: client_domains.directory_id still exists';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'client_domains' and column_name = 'map_id' and is_nullable = 'YES') then
    raise exception 'ROLLBACK VERIFY FAILED: client_domains.map_id is still nullable';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'directories' and column_name = 'theme_json') then
    raise exception 'ROLLBACK VERIFY FAILED: directories.theme_json still exists';
  end if;
  if exists (select 1 from public.resolve_custom_domain('__nonexistent_hostname__.invalid')) then
    raise exception 'ROLLBACK VERIFY FAILED: resolver returned a row for a hostname that should not exist';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;

select 'directories' as tbl, count(*) as rows from public.directories       union all
select 'client_domains', count(*) from public.client_domains
order by tbl;
