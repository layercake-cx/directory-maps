-- One auth user → one organisation (via contacts.user_id).
-- Stricter invite validation: block emails that already have accounts or other orgs.

-- Add only when data is clean (skip if legacy duplicates exist).
do $$
begin
  if not exists (
    select 1
    from public.contacts
    where user_id is not null
    group by user_id
    having count(*) > 1
  ) then
    create unique index if not exists idx_contacts_user_id_one_org
      on public.contacts (user_id)
      where user_id is not null;
    comment on index public.idx_contacts_user_id_one_org is
      'Each login can link to at most one organisation.';
  end if;
end;
$$;

-- Recreate create_team_invitation with 1:1 checks
create or replace function public.create_team_invitation(
  p_client_id text,
  p_email text,
  p_role text,
  p_map_ids text[] default '{}'::text[]
)
returns public.invitations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_inviter_id uuid;
  v_inv public.invitations%rowtype;
begin
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  if p_role is null or p_role not in ('manager', 'member') then
    raise exception 'Invalid role';
  end if;

  if not public.is_org_manager(p_client_id) then
    raise exception 'Access denied';
  end if;

  select c.id into v_inviter_id
  from public.contacts c
  where c.user_id = auth.uid()
    and c.client_id = p_client_id
  order by c.created_at asc
  limit 1;

  if v_inviter_id is null then
    raise exception 'Access denied';
  end if;

  if exists (
    select 1 from auth.users u
    where lower(u.email) = v_email
  ) then
    raise exception 'This user already has an account. Each person can only belong to one organisation.';
  end if;

  if exists (
    select 1 from public.contacts c
    where lower(c.email) = v_email
      and c.client_id <> p_client_id
  ) then
    raise exception 'This user already belongs to another organisation.';
  end if;

  if exists (
    select 1 from public.invitations i
    where i.client_id = p_client_id
      and lower(i.email) = v_email
      and i.accepted_at is null
  ) then
    raise exception 'A pending invitation already exists for this email.';
  end if;

  if exists (
    select 1 from public.contacts c
    where c.client_id = p_client_id
      and lower(c.email) = v_email
  ) then
    raise exception 'This email is already on your team.';
  end if;

  insert into public.invitations (
    client_id,
    email,
    role,
    invited_by_contact_id,
    map_ids
  )
  values (
    p_client_id,
    v_email,
    p_role,
    v_inviter_id,
    coalesce(p_map_ids, '{}'::text[])
  )
  returning * into v_inv;

  return v_inv;
end;
$$;

-- Accept: refuse if account is already tied to a different org
create or replace function public.accept_team_invitation()
returns public.contacts
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv public.invitations%rowtype;
  v_contact public.contacts%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_uid;

  if v_email is null or v_email = '' then
    return null;
  end if;

  select * into v_contact
  from public.contacts c
  where c.user_id = v_uid
  order by c.created_at asc
  limit 1;

  if found then
    return v_contact;
  end if;

  select * into v_inv
  from public.invitations i
  where lower(i.email) = v_email
    and i.accepted_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  if exists (
    select 1 from public.contacts c
    where lower(c.email) = v_email
      and c.client_id <> v_inv.client_id
  ) then
    raise exception 'This account is already associated with another organisation.';
  end if;

  insert into public.contacts (
    client_id,
    user_id,
    email,
    role,
    is_primary
  )
  values (
    v_inv.client_id,
    v_uid,
    v_email,
    v_inv.role,
    false
  )
  returning * into v_contact;

  if coalesce(array_length(v_inv.map_ids, 1), 0) > 0 then
    insert into public.contact_map_permissions (contact_id, map_id)
    select v_contact.id, unnest(v_inv.map_ids)
    on conflict (contact_id, map_id) do nothing;
  end if;

  update public.invitations
  set accepted_at = now()
  where id = v_inv.id;

  return v_contact;
end;
$$;
