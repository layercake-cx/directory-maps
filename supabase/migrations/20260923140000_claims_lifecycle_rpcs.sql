-- ============================================================
-- Migration: 20260923140000_claims_lifecycle_rpcs
-- Description: Phase 3 of the Claimed Directory Listings epic — manual
--              (admin-first) claim lifecycle. Builds the full claim
--              lifecycle through admin tooling before self-service exists
--              (a later phase), so the state machine and the magic-link
--              auth mechanic get proven without also needing Stripe or
--              public domain-verification UX.
--
--              Adds claim_users.name (the schema in Phase 1 only had
--              email/role — the admin "Create claim" flow needs an owner
--              display name, per the epic spec's claims list showing
--              "Owner: Jane Smith", not just an email address).
--
--              RPCs (all security definer, all explicitly check the caller
--              is a platform admin or a contact of the claim's client —
--              security definer bypasses RLS, so this check IS the
--              enforcement, mirroring publish_directory()'s exact pattern):
--                - can_manage_client(client_id)      -- shared permission check
--                - derive_domain_from_url(url)        -- normalises a website
--                                                         to a bare host
--                - is_generic_email_domain(domain)    -- static denylist
--                                                         (gmail.com etc.)
--                - create_manual_claim(...)           -- create + verify in
--                                                         one transaction
--                - admin_activate_claim(claim_id)
--                - admin_suspend_claim(claim_id)
--                - admin_reactivate_claim(claim_id)
--                - admin_revoke_claim(claim_id, reason) -- also clears
--                                                          directory_entries
--                                                          .current_claim_id
--                - admin_set_claim_payment_status(...)  -- manual/offline
--                                                          arrangement, no
--                                                          Stripe involved
--
--              Two claim-user-facing RPCs — the first callable by ANY
--              authenticated user, since a brand-new magic-link session has
--              no profiles/contacts row for RLS to key off:
--                - link_claim_user_by_email()  -- called once after a claim
--                    user's first magic-link login; matches auth.jwt()'s
--                    email against claim_users.email and sets user_id, so
--                    later lookups don't depend on email staying stable
--                - get_my_claim_context()      -- the calling user's own
--                    linked claims (role, entry, status) — read-only, used
--                    by the login confirmation screen now and the Phase 4
--                    Listing Manager shell later
--
--              Admin manual claims use exactly these same RPCs/tables that
--              a later self-service phase will also use — no parallel
--              claim/permissions model, per the epic's non-negotiable rule.
-- Affected tables: claim_users (1 column added); claims, claim_payments,
--                   directory_entries (rows mutated by the RPCs, not by
--                   this migration itself)
-- Rollback: _20260923140000_claims_lifecycle_rpcs.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-23
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste the "THE MIGRATION" body below here>
--   ROLLBACK;
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'claims') then
    raise exception 'ABORT: table public.claims does not exist — apply 20260923130000_create_claims_schema.sql first';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'claim_users' and column_name = 'name'
  ) then
    raise exception 'ABORT: claim_users.name already exists — migration may have already run';
  end if;
  if exists (select 1 from pg_proc where proname = 'create_manual_claim') then
    raise exception 'ABORT: create_manual_claim() already exists — migration may have already run';
  end if;
end $$;

select 'claims' as tbl, count(*) as rows from public.claims;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.claim_users add column name text null;
comment on column public.claim_users.name is 'Owner/editor display name, entered by whoever creates the claim (admin manually, or the claimant themselves in the self-service phase). Not required at the schema level -- a self-service claimant might not have entered one at the point a claim_users row is first created for an invited editor.';

-- ---- Shared permission check ----
create or replace function public.can_manage_client(p_client_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
    or exists (select 1 from public.contacts where user_id = auth.uid() and client_id = p_client_id);
$$;

comment on function public.can_manage_client(text) is
  'True when the calling user is a platform admin or a contact of the given client. Same precedence as publish_directory()''s inline check, factored out here since every claims lifecycle RPC below needs it.';

revoke all on function public.can_manage_client(text) from public, anon;
grant execute on function public.can_manage_client(text) to authenticated;

-- ---- Domain helpers ----
create or replace function public.derive_domain_from_url(p_url text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_url, '') = '' then null
    else nullif(
      lower(regexp_replace(p_url, '^(?:[a-zA-Z][a-zA-Z0-9+.-]*://)?(?:www\.)?([^/:?#]+).*$', '\1')),
      ''
    )
  end;
$$;

comment on function public.derive_domain_from_url(text) is
  'Normalises a website URL to a bare lowercase host (strips scheme, www., and any path/query/fragment). Null in, null out. Used to derive claims.listing_domain from directory_entries.website_url.';

create or replace function public.is_generic_email_domain(p_domain text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_domain, '')) in (
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'outlook.com',
    'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com', 'icloud.com',
    'me.com', 'mac.com', 'aol.com', 'protonmail.com', 'proton.me',
    'mail.com', 'gmx.com', 'yandex.com', 'zoho.com'
  );
$$;

comment on function public.is_generic_email_domain(text) is
  'Static denylist of free/generic email providers, per the epic spec: these cannot be used as evidence of organisational control for domain-email claim verification. MVP scope keeps this a fixed list, not admin-configurable.';

-- ---- Create a manual claim: select listing, enter owner, verify -- one
-- transaction. Admin decides verification_method up front (self-service,
-- a later phase, verifies live against these same rules).
create or replace function public.create_manual_claim(
  p_directory_item_id text,
  p_owner_name text,
  p_owner_email text,
  p_verification_method text,
  p_verification_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_directory_id text;
  v_client_id text;
  v_claimant_domain text;
  v_listing_domain text;
  v_claim_id uuid;
  v_owner_email text;
begin
  select directory_id into v_directory_id from public.directory_entries where id = p_directory_item_id;
  if v_directory_id is null then
    raise exception 'Directory item not found';
  end if;

  select client_id into v_client_id from public.directories where id = v_directory_id;

  if not public.can_manage_client(v_client_id) then
    raise exception 'Access denied';
  end if;

  if exists (select 1 from public.directory_entries where id = p_directory_item_id and current_claim_id is not null) then
    raise exception 'This listing already has a claim in progress or active';
  end if;

  if p_verification_method not in ('domain_email', 'admin_override') then
    raise exception 'Invalid verification_method: %', p_verification_method;
  end if;

  v_owner_email := lower(trim(coalesce(p_owner_email, '')));
  if v_owner_email = '' or v_owner_email not like '%@%' then
    raise exception 'A valid owner email is required';
  end if;
  v_claimant_domain := split_part(v_owner_email, '@', 2);

  select public.derive_domain_from_url(website_url) into v_listing_domain
  from public.directory_entries where id = p_directory_item_id;

  if p_verification_method = 'domain_email' then
    if v_listing_domain is null then
      raise exception 'This listing has no website on file to verify a domain against -- use admin override instead';
    end if;
    if public.is_generic_email_domain(v_claimant_domain) then
      raise exception 'Generic email providers cannot be used for domain verification -- use admin override instead';
    end if;
    if v_claimant_domain is distinct from v_listing_domain then
      raise exception 'Claimant email domain (%) does not match the listing domain (%) -- use admin override instead', v_claimant_domain, v_listing_domain;
    end if;
  else
    if coalesce(trim(p_verification_note), '') = '' then
      raise exception 'A verification note is required when using admin override';
    end if;
  end if;

  insert into public.claims (
    directory_id, directory_item_id, status, claimant_email, claimant_domain, listing_domain,
    verification_method, verification_note, admin_override_by, admin_override_at,
    created_by, created_by_user_id, started_at, verified_at
  ) values (
    v_directory_id, p_directory_item_id, 'verified', v_owner_email, v_claimant_domain, v_listing_domain,
    p_verification_method, nullif(trim(p_verification_note), ''),
    case when p_verification_method = 'admin_override' then auth.uid() else null end,
    case when p_verification_method = 'admin_override' then now() else null end,
    'admin', auth.uid(), now(), now()
  ) returning id into v_claim_id;

  insert into public.claim_users (claim_id, email, name, role, invited_at)
  values (v_claim_id, v_owner_email, nullif(trim(p_owner_name), ''), 'owner', now());

  update public.directory_entries set current_claim_id = v_claim_id, updated_at = now() where id = p_directory_item_id;

  return v_claim_id;
end;
$$;

comment on function public.create_manual_claim(text, text, text, text, text) is
  'Admin-created claim: selects a listing, records the owner, and verifies in one transaction (domain-email auto-check, or admin override with a required note). Sets directory_entries.current_claim_id so the listing stops being claimable elsewhere. Uses the exact same claims/claim_users rows a later self-service flow will also use.';

revoke all on function public.create_manual_claim(text, text, text, text, text) from public, anon;
grant execute on function public.create_manual_claim(text, text, text, text, text) to authenticated;

-- ---- Lifecycle transitions ----
create or replace function public.admin_activate_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_status text;
begin
  select d.client_id, c.status into v_client_id, v_status
  from public.claims c join public.directories d on d.id = c.directory_id
  where c.id = p_claim_id;

  if v_client_id is null then raise exception 'Claim not found'; end if;
  if not public.can_manage_client(v_client_id) then raise exception 'Access denied'; end if;
  if v_status not in ('verified', 'payment_pending') then
    raise exception 'Claim must be verified before it can be activated (current status: %)', v_status;
  end if;

  update public.claims set status = 'active', activated_at = now(), updated_at = now() where id = p_claim_id;
end;
$$;

create or replace function public.admin_suspend_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_status text;
begin
  select d.client_id, c.status into v_client_id, v_status
  from public.claims c join public.directories d on d.id = c.directory_id
  where c.id = p_claim_id;

  if v_client_id is null then raise exception 'Claim not found'; end if;
  if not public.can_manage_client(v_client_id) then raise exception 'Access denied'; end if;
  if v_status <> 'active' then
    raise exception 'Only an active claim can be suspended (current status: %)', v_status;
  end if;

  update public.claims set status = 'suspended', suspended_at = now(), updated_at = now() where id = p_claim_id;
end;
$$;

create or replace function public.admin_reactivate_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_status text;
begin
  select d.client_id, c.status into v_client_id, v_status
  from public.claims c join public.directories d on d.id = c.directory_id
  where c.id = p_claim_id;

  if v_client_id is null then raise exception 'Claim not found'; end if;
  if not public.can_manage_client(v_client_id) then raise exception 'Access denied'; end if;
  if v_status <> 'suspended' then
    raise exception 'Only a suspended claim can be reactivated (current status: %)', v_status;
  end if;

  update public.claims set status = 'active', updated_at = now() where id = p_claim_id;
end;
$$;

create or replace function public.admin_revoke_claim(p_claim_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_status text;
begin
  select d.client_id, c.status into v_client_id, v_status
  from public.claims c join public.directories d on d.id = c.directory_id
  where c.id = p_claim_id;

  if v_client_id is null then raise exception 'Claim not found'; end if;
  if not public.can_manage_client(v_client_id) then raise exception 'Access denied'; end if;
  if v_status = 'revoked' then
    raise exception 'Claim is already revoked';
  end if;

  update public.claims
  set status = 'revoked', revoked_at = now(), revoked_reason = nullif(trim(p_reason), ''), updated_at = now()
  where id = p_claim_id;

  -- The historical claim row stays revoked forever; the item itself becomes
  -- claimable again by clearing current_claim_id (not by deleting anything).
  update public.directory_entries
  set current_claim_id = null, updated_at = now()
  where current_claim_id = p_claim_id;
end;
$$;

create or replace function public.admin_set_claim_payment_status(
  p_claim_id uuid,
  p_payment_status text,
  p_payment_type text default null,
  p_amount_cents integer default null,
  p_currency text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_status text;
begin
  select d.client_id, c.status into v_client_id, v_status
  from public.claims c join public.directories d on d.id = c.directory_id
  where c.id = p_claim_id;

  if v_client_id is null then raise exception 'Claim not found'; end if;
  if not public.can_manage_client(v_client_id) then raise exception 'Access denied'; end if;
  if v_status = 'revoked' then
    raise exception 'Cannot set payment status on a revoked claim';
  end if;

  insert into public.claim_payments (claim_id, payment_provider, payment_type, payment_status, amount_cents, currency, paid_at, updated_at)
  values (
    p_claim_id, 'manual', p_payment_type, nullif(trim(p_payment_status), ''), p_amount_cents, p_currency,
    case when lower(coalesce(p_payment_status, '')) = 'paid' then now() else null end, now()
  )
  on conflict (claim_id) do update set
    payment_type = excluded.payment_type,
    payment_status = excluded.payment_status,
    amount_cents = excluded.amount_cents,
    currency = excluded.currency,
    paid_at = coalesce(excluded.paid_at, public.claim_payments.paid_at),
    updated_at = now();

  if v_status = 'verified' then
    update public.claims set status = 'payment_pending', updated_at = now() where id = p_claim_id;
  end if;
end;
$$;

comment on function public.admin_set_claim_payment_status(uuid, text, text, integer, text) is
  'Records a manual/offline commercial arrangement (payment_provider=''manual'') -- an invoice, complimentary access, etc. Moves a verified claim to payment_pending so it shows a distinct state before an admin explicitly activates it. No Stripe involvement; the follow-up Claim Payments epic adds real online payment.';

revoke all on function public.admin_activate_claim(uuid) from public, anon;
revoke all on function public.admin_suspend_claim(uuid) from public, anon;
revoke all on function public.admin_reactivate_claim(uuid) from public, anon;
revoke all on function public.admin_revoke_claim(uuid, text) from public, anon;
revoke all on function public.admin_set_claim_payment_status(uuid, text, text, integer, text) from public, anon;
grant execute on function public.admin_activate_claim(uuid) to authenticated;
grant execute on function public.admin_suspend_claim(uuid) to authenticated;
grant execute on function public.admin_reactivate_claim(uuid) to authenticated;
grant execute on function public.admin_revoke_claim(uuid, text) to authenticated;
grant execute on function public.admin_set_claim_payment_status(uuid, text, text, integer, text) to authenticated;

-- ---- Claim-user-facing: magic-link linking + self context ----
-- Callable by ANY authenticated user (not just admins/contacts) -- a
-- brand-new claim user has no profiles/contacts row, so this is
-- deliberately NOT gated by can_manage_client().
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

  update public.claim_users
  set user_id = auth.uid(), accepted_at = coalesce(accepted_at, now()), updated_at = now()
  where lower(email) = v_email
    and user_id is null
    and removed_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.link_claim_user_by_email() is
  'Called once after a claim user''s first magic-link login. Matches the authenticated JWT''s email against any unlinked claim_users rows and sets user_id -- so later lookups key off auth.uid(), not a mutable email address. Idempotent (no-op once already linked).';

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
    and cu.removed_at is null;
$$;

comment on function public.get_my_claim_context() is
  'The calling user''s own linked claims (via claim_users.user_id = auth.uid()) -- role, entry, and current status. Used by the claim login confirmation screen now, and the Phase 4 Listing Manager shell.';

revoke all on function public.link_claim_user_by_email() from public, anon;
revoke all on function public.get_my_claim_context() from public, anon;
grant execute on function public.link_claim_user_by_email() to authenticated;
grant execute on function public.get_my_claim_context() to authenticated;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'claim_users' and column_name = 'name'
  ) then
    raise exception 'VERIFY FAILED: claim_users.name was not added';
  end if;
  if not exists (select 1 from pg_proc where proname = 'can_manage_client') then
    raise exception 'VERIFY FAILED: can_manage_client() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'derive_domain_from_url') then
    raise exception 'VERIFY FAILED: derive_domain_from_url() was not created';
  end if;
  if public.derive_domain_from_url('https://www.ioic.org.uk/about') is distinct from 'ioic.org.uk' then
    raise exception 'VERIFY FAILED: derive_domain_from_url() did not normalise as expected';
  end if;
  if not public.is_generic_email_domain('gmail.com') then
    raise exception 'VERIFY FAILED: is_generic_email_domain() did not flag gmail.com';
  end if;
  if public.is_generic_email_domain('ioic.org.uk') then
    raise exception 'VERIFY FAILED: is_generic_email_domain() incorrectly flagged a real org domain';
  end if;
  if not exists (select 1 from pg_proc where proname = 'create_manual_claim') then
    raise exception 'VERIFY FAILED: create_manual_claim() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'admin_activate_claim') then
    raise exception 'VERIFY FAILED: admin_activate_claim() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'admin_suspend_claim') then
    raise exception 'VERIFY FAILED: admin_suspend_claim() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'admin_reactivate_claim') then
    raise exception 'VERIFY FAILED: admin_reactivate_claim() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'admin_revoke_claim') then
    raise exception 'VERIFY FAILED: admin_revoke_claim() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'admin_set_claim_payment_status') then
    raise exception 'VERIFY FAILED: admin_set_claim_payment_status() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'link_claim_user_by_email') then
    raise exception 'VERIFY FAILED: link_claim_user_by_email() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'get_my_claim_context') then
    raise exception 'VERIFY FAILED: get_my_claim_context() was not created';
  end if;
  raise notice 'VERIFY PASSED: claims lifecycle RPCs created';
end $$;

select 'claims' as tbl, count(*) as rows from public.claims;
