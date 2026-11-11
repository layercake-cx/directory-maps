-- ============================================================
-- Migration: 20261111100000_manual_claim_review
-- Description: A manual-mode claim request now also creates a real claim
--              (status 'claim_started', shown as "Awaiting review") so it
--              appears in the directory's Claims list and reserves the
--              listing. Adds claim_requests.claim_id, a service-role-only RPC
--              that creates the claim + request atomically, and
--              admin_approve_manual_claim(), which verifies the claim (admin
--              override) and adds the requester as owner. No claim_users row
--              exists until approval, so an unreviewed requester can never
--              sign in to the listing. Also hardens claim access: link_claim_user_by_email,
--              can_access_claim, is_claim_owner and get_my_claim_context now
--              require the claim to be approved (verified or later, not revoked).
-- Affected tables: claim_requests (new column), claims, claim_users,
--                  directory_entries (current_claim_id)
-- Rollback: _20261111100000_manual_claim_review.rollback.sql
-- Author: Claude Code
-- Date: 2026-11-11
-- ============================================================
--
-- DRY-RUN BLOCK (run this first, it makes NO persistent changes):
--   BEGIN;
--   <paste THE MIGRATION body below here>
--   ROLLBACK;
--
-- RUN ORDER: dry-run -> STAGING (beqejxneehilplrtpntn) -> verification ->
-- PRODUCTION (gxixwdjfmegxcxfeflro) only after explicit sign-off.
--
-- Forbidden operations: none. One additive nullable column, two new functions.
-- ============================================================

do $$
begin
  if to_regclass('public.claim_requests') is null then
    raise exception 'ABORT: claim_requests does not exist -- apply 20261110140000_manual_claim_mode.sql first';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'claim_requests' and column_name = 'claim_id'
  ) then
    raise exception 'ABORT: claim_requests.claim_id already exists, migration may have already run';
  end if;
end $$;

select count(*) as claim_requests_rows from public.claim_requests;
select count(*) as claims_rows from public.claims;
-- Save both counts. They must be UNCHANGED after (additive only).

-- THE MIGRATION

alter table public.claim_requests
  add column claim_id uuid null references public.claims(id) on delete set null;

create index idx_claim_requests_claim on public.claim_requests(claim_id);

comment on column public.claim_requests.claim_id is
  'The claims row created for this request (status claim_started until an admin approves or revokes it). Null for requests stored before manual review existed.';

-- Atomic: claim + request + listing reservation. Called only by the
-- submit_claim_request Edge Function (service role); never exposed to anon.
create or replace function public.create_manual_claim_request(
  p_directory_item_id text,
  p_name text,
  p_email text,
  p_message text,
  p_to_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_directory_id text;
  v_entry_name text;
  v_website_url text;
  v_current_claim_id uuid;
  v_is_active boolean;
  v_email text;
  v_claim_id uuid;
  v_request_id uuid;
begin
  select directory_id, name, website_url, current_claim_id, is_active
    into v_directory_id, v_entry_name, v_website_url, v_current_claim_id, v_is_active
  from public.directory_entries
  where id = p_directory_item_id
  for update;

  if v_directory_id is null or v_is_active is not true then
    raise exception 'Listing not found';
  end if;
  if v_current_claim_id is not null then
    raise exception 'This listing already has a claim in progress or active';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or v_email not like '%@%' then
    raise exception 'A valid email is required';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'A name is required';
  end if;

  insert into public.claims (
    directory_id, directory_item_id, status, claimant_email, claimant_domain, listing_domain,
    created_by, started_at
  ) values (
    v_directory_id, p_directory_item_id, 'claim_started', v_email, split_part(v_email, '@', 2),
    public.derive_domain_from_url(v_website_url), 'self_service', now()
  ) returning id into v_claim_id;

  insert into public.claim_requests (
    directory_id, directory_item_id, entry_name, requester_name, requester_email, message, to_email, claim_id
  ) values (
    v_directory_id, p_directory_item_id, coalesce(v_entry_name, 'the listing'), trim(p_name), v_email,
    nullif(trim(p_message), ''), p_to_email, v_claim_id
  ) returning id into v_request_id;

  update public.directory_entries set current_claim_id = v_claim_id, updated_at = now()
  where id = p_directory_item_id;

  return jsonb_build_object('claim_id', v_claim_id, 'request_id', v_request_id);
end;
$$;

comment on function public.create_manual_claim_request(text, text, text, text, text) is
  'Service-role only. Creates a claim_started claim and its claim_requests row for a manual-mode request and reserves the listing (current_claim_id), atomically. Deliberately creates NO claim_users row: the requester is unverified, and a claim user can sign in via magic link. admin_approve_manual_claim() adds the owner on approval.';

revoke all on function public.create_manual_claim_request(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_manual_claim_request(text, text, text, text, text) to service_role;

create or replace function public.admin_approve_manual_claim(p_claim_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_status text;
  v_email text;
  v_name text;
begin
  select d.client_id, c.status, c.claimant_email
    into v_client_id, v_status, v_email
  from public.claims c join public.directories d on d.id = c.directory_id
  where c.id = p_claim_id;

  if v_client_id is null then raise exception 'Claim not found'; end if;
  if not public.can_manage_client(v_client_id) then raise exception 'Access denied'; end if;
  if v_status <> 'claim_started' then
    raise exception 'Only a claim awaiting review can be approved (current status: %)', v_status;
  end if;

  select requester_name into v_name from public.claim_requests where claim_id = p_claim_id limit 1;
  if not found then
    raise exception 'This claim did not come from a manual claim request';
  end if;

  update public.claims
  set status = 'verified',
      verification_method = 'admin_override',
      verification_note = coalesce(nullif(trim(p_note), ''), 'Approved from manual claim request'),
      admin_override_by = auth.uid(),
      admin_override_at = now(),
      verified_at = now(),
      updated_at = now()
  where id = p_claim_id;

  insert into public.claim_users (claim_id, email, name, role, invited_at)
  values (p_claim_id, v_email, nullif(trim(v_name), ''), 'owner', now());
end;
$$;

comment on function public.admin_approve_manual_claim(uuid, text) is
  'Directory admin approves a manual claim request: claim_started -> verified (admin override) and the requester becomes the claim owner. Activate and invitation are the existing separate steps. Reject = the existing admin_revoke_claim().';

revoke all on function public.admin_approve_manual_claim(uuid, text) from public, anon;
grant execute on function public.admin_approve_manual_claim(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- HARDENING: a claim user only gets access once their claim is APPROVED.
-- Approved = verified (domain match, or admin approval/override) or any later
-- live state. claim_started / email_verification_pending (not yet approved) and
-- revoked claims grant nothing: their users are never linked at sign-in, and
-- can_access_claim()/is_claim_owner()/get_my_claim_context() return nothing.
-- Before this, access depended only on a claim_users row existing.
-- ------------------------------------------------------------

create or replace function public.claim_status_is_approved(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in ('verified', 'payment_pending', 'active', 'payment_failed', 'suspended');
$$;

create or replace function public.link_claim_user_by_email()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count integer;
begin
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    raise exception 'No authenticated email found';
  end if;

  update public.claim_users cu
  set user_id = auth.uid(), accepted_at = coalesce(cu.accepted_at, now()), updated_at = now()
  from public.claims c
  where c.id = cu.claim_id
    and public.claim_status_is_approved(c.status)
    and lower(cu.email) = v_email
    and cu.user_id is null
    and cu.removed_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.can_access_claim(p_claim_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.claim_users cu
    join public.claims c on c.id = cu.claim_id
    where cu.claim_id = p_claim_id and cu.user_id = auth.uid() and cu.removed_at is null
      and public.claim_status_is_approved(c.status)
  );
$$;

create or replace function public.is_claim_owner(p_claim_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.claim_users cu
    join public.claims c on c.id = cu.claim_id
    where cu.claim_id = p_claim_id and cu.user_id = auth.uid() and cu.role = 'owner' and cu.removed_at is null
      and public.claim_status_is_approved(c.status)
  );
$$;

create or replace function public.get_my_claim_context()
returns table (
  claim_id uuid,
  claim_user_id uuid,
  directory_id text,
  directory_item_id text,
  entry_name text,
  claim_status text,
  role text
)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, cu.id, c.directory_id, c.directory_item_id, e.name, c.status, cu.role
  from public.claim_users cu
  join public.claims c on c.id = cu.claim_id
  join public.directory_entries e on e.id = c.directory_item_id
  where cu.user_id = auth.uid()
    and cu.removed_at is null
    and public.claim_status_is_approved(c.status);
$$;

-- POST-MIGRATION VERIFICATION
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'claim_requests' and column_name = 'claim_id'
  ) then
    raise exception 'VERIFY FAILED: claim_requests.claim_id missing';
  end if;
  if to_regprocedure('public.create_manual_claim_request(text,text,text,text,text)') is null
     or to_regprocedure('public.admin_approve_manual_claim(uuid,text)') is null then
    raise exception 'VERIFY FAILED: functions missing';
  end if;
  if public.claim_status_is_approved('claim_started') or public.claim_status_is_approved('revoked') or not public.claim_status_is_approved('verified') then
    raise exception 'VERIFY FAILED: claim_status_is_approved() wrong';
  end if;
  raise notice 'VERIFY PASSED';
end $$;

select count(*) as claim_requests_rows from public.claim_requests;
select count(*) as claims_rows from public.claims;
-- Expected: both unchanged from the pre-migration counts.
