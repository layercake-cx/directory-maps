-- ============================================================
-- Rollback: 20260809120000_drop_abandoned_directory_map_associations
-- Reverses: recreates an empty directory_map_associations table matching
--           the abandoned DIR-E8 schema. Only for undoing this cleanup by
--           mistake — do NOT use this to revive the directory→map linking
--           product (removed; see docs/DIRECTORIES.md §4.7 / DIR-E4).
-- ============================================================

do $$
begin
  if to_regclass('public.directory_map_associations') is not null then
    raise exception 'ABORT: directory_map_associations already exists — nothing to recreate';
  end if;
end $$;

create table public.directory_map_associations (
  directory_id text not null references public.directories(id) on delete cascade,
  map_id text not null references public.maps(id) on delete cascade,
  role text not null check (role in ('embedded_on_directory', 'directory_as_datasource')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (directory_id, map_id, role)
);

create index idx_dma_directory on public.directory_map_associations(directory_id);
create index idx_dma_map on public.directory_map_associations(map_id);

alter table public.directory_map_associations enable row level security;

create policy "directory_map_associations_admin_all"
  on public.directory_map_associations for all
  to authenticated
  using (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
  );

create policy "directory_map_associations_own_client"
  on public.directory_map_associations for all
  to authenticated
  using (
    directory_id in (select id from public.directories where client_id = public.current_user_client_id())
    and map_id in (select id from public.maps where client_id = public.current_user_client_id())
  )
  with check (
    directory_id in (select id from public.directories where client_id = public.current_user_client_id())
    and map_id in (select id from public.maps where client_id = public.current_user_client_id())
  );

grant select, insert, update, delete on table public.directory_map_associations to authenticated, service_role;

do $$
begin
  if to_regclass('public.directory_map_associations') is null then
    raise exception 'ROLLBACK VERIFY FAILED: table was not recreated';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED: empty directory_map_associations recreated';
end $$;
