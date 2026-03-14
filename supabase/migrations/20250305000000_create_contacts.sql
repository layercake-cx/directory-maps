-- Contacts: one per client (for now), the person who has a login.
-- Client = organisation; Contact = person with login linked to that client.
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  user_id uuid null,  -- auth.users id when contact has login
  email text not null,
  name text null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contacts_client_id on public.contacts(client_id);
create index if not exists idx_contacts_user_id on public.contacts(user_id) where user_id is not null;

comment on table public.contacts is 'Contacts (people with logins) belonging to a client organisation. One primary contact per client for now.';
