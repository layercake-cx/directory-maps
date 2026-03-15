-- Base schema: run this first. Creates clients, maps, groups, listings.
-- Other migrations (contacts, map_data_sources, add columns) depend on these.

-- Clients (organisations/customers)
create table if not exists public.clients (
  id text primary key,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_clients_slug on public.clients(slug);

-- Maps (one per client, many per client)
create table if not exists public.maps (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  name text not null,
  slug text not null,
  default_lat double precision null,
  default_lng double precision null,
  default_zoom integer null,
  show_list_panel boolean not null default true,
  enable_clustering boolean not null default true,
  marker_style text not null default 'pin',
  marker_color text not null default '#4A9BAA',
  theme_json jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_maps_client_id on public.maps(client_id);

-- Groups (e.g. categories per map)
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  map_id text not null references public.maps(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  color text null
);

create index if not exists idx_groups_map_id on public.groups(map_id);

-- Listings (places/entries on a map)
create table if not exists public.listings (
  id text primary key,
  map_id text not null references public.maps(id) on delete cascade,
  group_id uuid null references public.groups(id) on delete set null,
  name text not null,
  address text null,
  postcode text null,
  country text null,
  city text null,
  lat double precision null,
  lng double precision null,
  is_active boolean not null default true,
  website_url text null,
  email text null,
  phone text null,
  logo_url text null,
  notes_html text null,
  allow_html boolean not null default false,
  geocode_status text null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_listings_map_id on public.listings(map_id);
create index if not exists idx_listings_group_id on public.listings(group_id);

-- Public view for embed map (no RLS on view; restrict in app by map_id)
create or replace view public.public_listings as
  select * from public.listings;
