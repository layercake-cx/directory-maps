-- Client-side error telemetry: admins read; anyone can insert (anon + authenticated) for public/unauth flows.
-- user_id is always set from auth.uid() server-side (clients cannot spoof).

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null,
  severity text not null default 'error',
  message text not null,
  stack text,
  component_stack text,
  context jsonb not null default '{}'::jsonb,
  user_id uuid references auth.users (id) on delete set null,
  environment text,
  route text,
  user_agent text
);

create index if not exists idx_error_logs_created_at on public.error_logs (created_at desc);

comment on table public.error_logs is 'Application errors from the browser; inserted by the SPA, readable by admins only.';

create or replace function public.error_logs_set_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_error_logs_set_user_id on public.error_logs;
create trigger trg_error_logs_set_user_id
  before insert on public.error_logs
  for each row
  execute function public.error_logs_set_user_id();

alter table public.error_logs enable row level security;

create policy "error_logs_insert_anon_authenticated"
  on public.error_logs for insert
  to anon, authenticated
  with check (true);

create policy "error_logs_select_admin"
  on public.error_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );
