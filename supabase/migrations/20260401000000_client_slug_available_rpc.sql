-- Allow anonymous signup flow to check slug availability without exposing clients rows.
create or replace function public.is_client_slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.clients c
    where lower(trim(c.slug)) = lower(trim(p_slug))
  );
$$;

revoke all on function public.is_client_slug_available(text) from public;
grant execute on function public.is_client_slug_available(text) to anon, authenticated;
