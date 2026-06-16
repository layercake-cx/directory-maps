-- Messaging sent-messages list: align DB access with Messaging UI (can_manage_maps / is_primary).

create or replace function public.can_access_client_messaging(p_client_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.contacts c
      where c.user_id = auth.uid()
        and c.client_id = p_client_id
        and (
          c.role in ('owner', 'manager')
          or c.is_primary = true
          or c.can_manage_maps = true
        )
    );
$$;

revoke all on function public.can_access_client_messaging(text) from public;
grant execute on function public.can_access_client_messaging(text) to authenticated;

comment on function public.can_access_client_messaging(text) is
  'True for platform admins or client contacts who can open Messaging (owner/manager/primary/can_manage_maps).';

create or replace function public.list_client_contact_submissions(
  p_client_id text,
  p_limit integer default 500
)
returns table (
  id uuid,
  submitted_at timestamptz,
  map_id text,
  map_name text,
  listing_id text,
  listing_name text,
  to_email text,
  sender_name text,
  sender_email text,
  sender_phone text,
  message text,
  surface text,
  email_sent boolean,
  email_error text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.can_access_client_messaging(p_client_id) then
    raise exception 'Access denied';
  end if;

  return query
  select
    s.id,
    s.submitted_at,
    s.map_id,
    coalesce(m.name, s.map_id) as map_name,
    s.listing_id,
    s.listing_name,
    s.to_email,
    s.sender_name,
    s.sender_email,
    s.sender_phone,
    s.message,
    s.surface,
    s.email_sent,
    s.email_error
  from public.map_contact_submissions s
  join public.maps m on m.id = s.map_id
  where m.client_id = p_client_id
  order by s.submitted_at desc
  limit greatest(1, least(coalesce(p_limit, 500), 500));
end;
$$;

revoke all on function public.list_client_contact_submissions(text, integer) from public;
grant execute on function public.list_client_contact_submissions(text, integer) to authenticated;

comment on function public.list_client_contact_submissions(text, integer) is
  'Contact form log for Messaging → Sent messages (org-scoped, newest first).';

-- Align direct table reads with the same permission model.
drop policy if exists "map_contact_submissions_authenticated_select" on public.map_contact_submissions;

create policy "map_contact_submissions_authenticated_select"
  on public.map_contact_submissions for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.maps m
      where m.id = map_contact_submissions.map_id
        and public.can_access_client_messaging(m.client_id)
    )
  );

-- POST-MIGRATION INTEGRITY (schema-only; row counts unchanged)
select count(*) as map_contact_submissions from public.map_contact_submissions;
