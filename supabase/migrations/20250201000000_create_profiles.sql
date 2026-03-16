-- Profiles: links auth users to app roles (e.g. admin).
-- user_id = auth.users.id; role = 'admin' for admin users.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text null
);

create index if not exists idx_profiles_role on public.profiles(role) where role is not null;

comment on table public.profiles is 'App roles per auth user. role = ''admin'' grants admin access.';
