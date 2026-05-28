-- Public preview for team invitation signup/login links (no auth required).
-- Used by /#/signup?invite=<uuid> and /#/login?invite=<uuid>.

create or replace function public.get_team_invitation_preview(p_invitation_id uuid)
returns table (
  invitation_id uuid,
  email text,
  client_name text,
  role text,
  expires_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    i.id as invitation_id,
    i.email,
    c.name as client_name,
    i.role,
    i.expires_at
  from public.invitations i
  join public.clients c on c.id = i.client_id
  where i.id = p_invitation_id
    and i.accepted_at is null
    and i.expires_at > now();
$$;

revoke all on function public.get_team_invitation_preview(uuid) from public;
grant execute on function public.get_team_invitation_preview(uuid) to anon, authenticated;

comment on function public.get_team_invitation_preview(uuid) is
  'Returns invite details for the signup/login page. Does not expose client_id or map_ids.';
