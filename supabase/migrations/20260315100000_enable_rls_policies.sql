-- Enable RLS and add policies so test matches prod.
-- Authenticated users (admin/client app) get full access; anon can only read data needed for the embed.

-- Profiles: users can read their own row (for getMyRole).
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = user_id);

-- Clients: authenticated full access (admin and client dashboards).
alter table public.clients enable row level security;

create policy "clients_authenticated_all"
  on public.clients for all
  to authenticated
  using (true)
  with check (true);

-- Maps: authenticated full access; anon can read (embed loads map config).
alter table public.maps enable row level security;

create policy "maps_authenticated_all"
  on public.maps for all
  to authenticated
  using (true)
  with check (true);

create policy "maps_anon_select"
  on public.maps for select
  to anon
  using (true);

-- Groups: authenticated full access; anon can read (embed loads groups).
alter table public.groups enable row level security;

create policy "groups_authenticated_all"
  on public.groups for all
  to authenticated
  using (true)
  with check (true);

create policy "groups_anon_select"
  on public.groups for select
  to anon
  using (true);

-- Listings: authenticated full access; anon can read (embed and public_listings view).
alter table public.listings enable row level security;

create policy "listings_authenticated_all"
  on public.listings for all
  to authenticated
  using (true)
  with check (true);

create policy "listings_anon_select"
  on public.listings for select
  to anon
  using (true);

-- Contacts: authenticated full access (client dashboard, AuthForm).
alter table public.contacts enable row level security;

create policy "contacts_authenticated_all"
  on public.contacts for all
  to authenticated
  using (true)
  with check (true);

-- map_data_sources: already has RLS enabled; add policy so authenticated can read/update (dashboard status).
create policy "map_data_sources_authenticated_all"
  on public.map_data_sources for all
  to authenticated
  using (true)
  with check (true);
