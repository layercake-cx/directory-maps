-- Platform admin audit log: map design, publish, data, team, email, billing, ops (see AGENTS.md).

create table if not exists public.admin_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  event_type text not null,
  event_category text not null,
  event_subtype text not null default '',
  client_id text null references public.clients (id) on delete set null,
  map_id text null references public.maps (id) on delete set null,
  actor_user_id uuid null references auth.users (id) on delete set null,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_admin_events_occurred_at
  on public.admin_events (occurred_at desc);

create index if not exists idx_admin_events_category_time
  on public.admin_events (event_category, occurred_at desc);

create index if not exists idx_admin_events_subtype_time
  on public.admin_events (event_category, event_subtype, occurred_at desc);

create index if not exists idx_admin_events_client_time
  on public.admin_events (client_id, occurred_at desc)
  where client_id is not null;

create index if not exists idx_admin_events_map_time
  on public.admin_events (map_id, occurred_at desc)
  where map_id is not null;

comment on table public.admin_events is
  'Structured admin/client-portal audit events (event_type + meta). Readable by platform admins only.';

create or replace function public.admin_events_set_actor_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.actor_user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_admin_events_set_actor_user_id on public.admin_events;
create trigger trg_admin_events_set_actor_user_id
  before insert on public.admin_events
  for each row
  execute function public.admin_events_set_actor_user_id();

alter table public.admin_events enable row level security;

-- Authenticated app users record actions (admin UI, client portal, etc.).
create policy "admin_events_insert_authenticated"
  on public.admin_events for insert
  to authenticated
  with check (true);

-- Layercake platform admins read the activity log.
create policy "admin_events_select_admin"
  on public.admin_events for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

grant select, insert on table public.admin_events to authenticated, service_role;
