-- Unified team directory for the client portal (members + pending invites + last sign-in).

create or replace function public.list_client_team_directory(p_client_id text)
returns table (
  row_kind text,
  row_id uuid,
  email text,
  display_name text,
  role text,
  is_primary boolean,
  user_id uuid,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  invite_created_at timestamptz,
  invite_expires_at timestamptz,
  invite_map_ids text[]
)
language plpgsql
security definer
stable
set search_path = public, auth
as $$
begin
  if not public.is_org_manager(p_client_id) then
    raise exception 'Access denied';
  end if;

  return query
  select
    'member'::text as row_kind,
    c.id as row_id,
    c.email,
    c.name as display_name,
    c.role,
    c.is_primary,
    c.user_id,
    u.last_sign_in_at,
    u.email_confirmed_at,
    null::timestamptz as invite_created_at,
    null::timestamptz as invite_expires_at,
    null::text[] as invite_map_ids
  from public.contacts c
  left join auth.users u on u.id = c.user_id
  where c.client_id = p_client_id

  union all

  select
    'invite_pending'::text,
    i.id,
    i.email,
    null::text,
    i.role,
    false,
    null::uuid,
    null::timestamptz,
    null::timestamptz,
    i.created_at,
    i.expires_at,
    i.map_ids
  from public.invitations i
  where i.client_id = p_client_id
    and i.accepted_at is null
    and i.expires_at > now();
end;
$$;

revoke all on function public.list_client_team_directory(text) from public;
grant execute on function public.list_client_team_directory(text) to authenticated;

comment on function public.list_client_team_directory(text) is
  'Team roster for owners/managers: active contacts with auth last_sign_in_at plus pending invitations.';
