-- ============================================================
-- Migration: 20261008140000_invite_primary_and_all_access
-- Description: Team invitations can now carry is_primary, and contacts get a
--   has_all_access flag so invited Members see every map and directory
--   without per-directory grants. Previously an invitation only stored a role
--   and map ids, so primary status and directory access were lost at signup.
-- Affected tables: contacts, invitations (functions: create_team_invitation,
--   accept_team_invitation)
-- Rollback: _20261008140000_invite_primary_and_all_access.rollback.sql
-- Author: Claude
-- Date: 2026-10-08
-- ============================================================
--
-- DRY-RUN BLOCK:  BEGIN; <body below> ROLLBACK;
--
-- INTEGRITY CHECKLIST (before and after; counts must match):
--   select count(*) from public.contacts;
--   select count(*) from public.invitations;
--   select count(*) from public.contact_map_permissions;
--   select count(*) from public.contact_directory_permissions;
--
-- Forbidden-operation flag: DROP FUNCTION create_team_invitation(text,text,text,text[])
-- (replaced by a new signature; no table or column is dropped).
-- ============================================================

alter table public.contacts
  add column if not exists has_all_access boolean not null default false;

comment on column public.contacts.has_all_access is
  'When true, a Member contact can open every map and directory in the organisation without per-directory grants (contact_directory_permissions). Owners/managers/primaries always can. Set on contacts created from an invitation.';

alter table public.invitations
  add column if not exists is_primary boolean not null default false;

comment on column public.invitations.is_primary is
  'When true, the contact created on acceptance is a primary contact (contacts.is_primary). Only primaries, owners or platform admins can create such an invitation.';

-- ------------------------------------------------------------
-- create_team_invitation: new signature (p_is_primary replaces p_map_ids)
-- ------------------------------------------------------------
drop function if exists public.create_team_invitation(text, text, text, text[]);

create or replace function public.create_team_invitation(
  p_client_id text,
  p_email text,
  p_role text,
  p_is_primary boolean default false
)
returns public.invitations
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_inviter_id uuid;
  v_role text := p_role;
  v_primary boolean := coalesce(p_is_primary, false);
  v_inv public.invitations%rowtype;
begin
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  if v_role is null or v_role not in ('manager', 'member') then
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

  if v_primary then
    if not (
      public.is_admin()
      or exists (
        select 1 from public.contacts c
        where c.id = v_inviter_id
          and (c.is_primary = true or c.role = 'owner')
      )
    ) then
      raise exception 'Only a primary contact can invite another primary contact.';
    end if;
    v_role := 'manager';
  end if;

  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
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

  insert into public.invitations (client_id, email, role, is_primary, invited_by_contact_id)
  values (p_client_id, v_email, v_role, v_primary, v_inviter_id)
  returning * into v_inv;

  return v_inv;
end;
$$;

revoke all on function public.create_team_invitation(text, text, text, boolean) from public;
grant execute on function public.create_team_invitation(text, text, text, boolean) to authenticated;

-- ------------------------------------------------------------
-- accept_team_invitation: carry is_primary and has_all_access onto the contact
-- ------------------------------------------------------------
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

  insert into public.contacts (client_id, user_id, email, role, is_primary, has_all_access)
  values (v_inv.client_id, v_uid, v_email, v_inv.role, v_inv.is_primary, true)
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

revoke all on function public.accept_team_invitation() from public;
grant execute on function public.accept_team_invitation() to authenticated;

-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION (aborts the migration if anything is off)
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='contacts' and column_name='has_all_access') then
    raise exception 'VERIFY FAILED: contacts.has_all_access missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='invitations' and column_name='is_primary') then
    raise exception 'VERIFY FAILED: invitations.is_primary missing';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='create_team_invitation') <> 1 then
    raise exception 'VERIFY FAILED: expected exactly one create_team_invitation overload';
  end if;
  if exists (select 1 from public.contacts where has_all_access) then
    raise exception 'VERIFY FAILED: existing contacts should not have has_all_access set';
  end if;
  raise notice 'VERIFY PASSED: invite_primary_and_all_access';
end $$;
