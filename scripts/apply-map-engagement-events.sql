-- Run in Supabase Dashboard → SQL Editor on your **staging/test** project
-- (or any project missing map_engagement_events).
-- Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS where needed.

create table if not exists public.map_engagement_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  map_id text not null references public.maps(id) on delete cascade,
  listing_id text null references public.listings(id) on delete set null,
  event_type text not null,
  surface text not null default 'embed',
  client_session_id text null,
  meta jsonb null
);

-- Ensure check constraints match app (includes search)
alter table public.map_engagement_events drop constraint if exists map_engagement_event_type;
alter table public.map_engagement_events add constraint map_engagement_event_type check (
  event_type in (
    'session_start',
    'directory_group_expand',
    'listing_panel_open',
    'website_click',
    'email_click',
    'message_compose_open',
    'message_sent',
    'search'
  )
);

alter table public.map_engagement_events drop constraint if exists map_engagement_surface;
alter table public.map_engagement_events add constraint map_engagement_surface check (
  surface in ('embed', 'client_preview', 'admin_preview')
);

create index if not exists idx_map_engagement_map_time
  on public.map_engagement_events(map_id, occurred_at desc);

create index if not exists idx_map_engagement_listing
  on public.map_engagement_events(listing_id)
  where listing_id is not null;

alter table public.map_engagement_events enable row level security;

drop policy if exists "map_engagement_anon_insert" on public.map_engagement_events;
create policy "map_engagement_anon_insert"
  on public.map_engagement_events for insert
  to anon
  with check (
    exists (
      select 1 from public.maps m
      where m.id = map_engagement_events.map_id
        and m.published_at is not null
    )
    and (
      map_engagement_events.listing_id is null
      or exists (
        select 1 from public.listings l
        where l.id = map_engagement_events.listing_id
          and l.map_id = map_engagement_events.map_id
      )
    )
  );

drop policy if exists "map_engagement_authenticated_select" on public.map_engagement_events;
create policy "map_engagement_authenticated_select"
  on public.map_engagement_events for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'admin')
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

-- Refresh PostgREST schema cache so the API sees the new table immediately
notify pgrst, 'reload schema';
