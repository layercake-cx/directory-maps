-- 1. Add role to contacts
alter table public.contacts
  add column if not exists role text not null default 'member'
  check (role in ('owner', 'manager', 'member'));

-- Backfill: existing primary contacts become owners
update public.contacts set role = 'owner' where is_primary = true and role = 'member';

-- 2. Pending invitations
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('manager', 'member')),
  invited_by_contact_id uuid null references public.contacts(id) on delete set null,
  map_ids text[] not null default array[]::text[],
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_invitations_email
  on public.invitations(lower(email)) where accepted_at is null;
create index if not exists idx_invitations_client_id
  on public.invitations(client_id);

comment on table public.invitations is
  'Pending team invites. Accepted when invited user signs up or logs in with password (same email). map_ids applied to contact_map_permissions on acceptance.';

-- 3. Per-contact map access (used for member role; owners/managers bypass this)
create table if not exists public.contact_map_permissions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  map_id text not null references public.maps(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (contact_id, map_id)
);

create index if not exists idx_cmp_contact on public.contact_map_permissions(contact_id);
create index if not exists idx_cmp_map on public.contact_map_permissions(map_id);

comment on table public.contact_map_permissions is
  'Explicit map access grants for member contacts. owner/manager contacts see all maps in their org.';
