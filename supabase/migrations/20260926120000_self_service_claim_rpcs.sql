-- ============================================================
-- Migration: 20260926120000_self_service_claim_rpcs
-- Description: Phase 7 of the Claimed Directory Listings epic — the public
--              self-service "Claim this listing" flow. Two RPCs:
--
--              - start_self_service_claim(directory_item_id, email) — the
--                one and only entry point an anonymous visitor can call
--                (granted to `anon`, not just `authenticated`). Re-checks
--                everything the published page's own JS already checked
--                before showing the CTA (claims enabled, item unclaimed) --
--                the client-side gate is just UX, this is the real
--                enforcement, per the epic's non-negotiable rule that
--                permissions are enforced server-side. Runs the exact same
--                domain-verification rules create_manual_claim() already
--                uses (derive_domain_from_url/is_generic_email_domain from
--                20260923140000), so self-service and admin-created claims
--                share one verification path, not two. Creates the claim
--                already `verified` (domain checked at this step) and sets
--                directory_entries.current_claim_id immediately, which is
--                what actually removes the CTA on the next publish -- the
--                spec's "once a claim process has started, the normal
--                public claiming route must no longer be available for
--                that listing" requirement. Does NOT send the magic link
--                itself (that's a second, separate call the published
--                page's JS makes directly to Supabase Auth) and does NOT
--                record listing_claim_start (the published page's JS does
--                that client-side after both calls succeed, matching how
--                listing_enquiry_sent is already recorded) — this RPC's
--                job is domain logic only.
--
--              - activate_self_service_claim(claim_id) — called once,
--                right after a self-service claimant's first magic-link
--                login (see link_claim_user_by_email() from Phase 3, which
--                runs first and is unchanged). Advances a claim straight
--                from `verified` to `active` -- there is no payment step in
--                this epic; that only exists via manual admin claims
--                (Phase 3) until the separate "Claim Payments (Stripe)"
--                follow-up epic lands. Records listing_claim_complete
--                server-side inside this RPC, not client-side --
--                map_engagement_events' anon-insert RLS policy doesn't
--                cover `authenticated` callers, and this is the first place
--                in the whole flow where the caller IS authenticated, so a
--                client-side insert from ClaimLogin.jsx would just be
--                silently rejected by RLS. A security definer RPC insert
--                sidesteps that cleanly rather than adding a new RLS policy
--                just for this one event.
-- Affected tables: none (RPCs only; reads/writes directories,
--                  directory_claim_settings, directory_entries, claims,
--                  claim_users, map_engagement_events)
-- Rollback: _20260926120000_self_service_claim_rpcs.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-26
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
  if not exists (select 1 from pg_proc where proname = 'derive_domain_from_url') then
    raise exception 'ABORT: derive_domain_from_url() does not exist — apply 20260923140000_claims_lifecycle_rpcs.sql first';
  end if;
  if not exists (select 1 from pg_proc where proname = 'can_access_claim') then
    raise exception 'ABORT: can_access_claim() does not exist — apply 20260923150000_claim_manager_shell_rpcs.sql first';
  end if;
  if exists (select 1 from pg_proc where proname = 'start_self_service_claim') then
    raise exception 'ABORT: start_self_service_claim() already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

create or replace function public.start_self_service_claim(
  p_directory_item_id text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_directory_id text;
  v_client_id text;
  v_website_url text;
  v_current_claim_id uuid;
  v_is_active boolean;
  v_dcs_enabled boolean;
  v_claims_entitled boolean;
  v_email text;
  v_claimant_domain text;
  v_listing_domain text;
  v_claim_id uuid;
begin
  select directory_id, website_url, current_claim_id, is_active
    into v_directory_id, v_website_url, v_current_claim_id, v_is_active
  from public.directory_entries
  where id = p_directory_item_id;

  if v_directory_id is null or v_is_active is not true then
    raise exception 'Listing not found';
  end if;
  if v_current_claim_id is not null then
    raise exception 'This listing already has a claim in progress or active';
  end if;

  select client_id into v_client_id from public.directories where id = v_directory_id;

  select enabled into v_dcs_enabled from public.directory_claim_settings where directory_id = v_directory_id;
  if coalesce(v_dcs_enabled, false) is not true then
    raise exception 'Claiming is not enabled for this directory';
  end if;

  select coalesce(public.resolve_claims_entitlement(v_client_id), false) into v_claims_entitled;
  if not v_claims_entitled then
    raise exception 'Claiming is not available for this directory';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' or v_email not like '%@%' then
    raise exception 'A valid work email is required';
  end if;
  v_claimant_domain := split_part(v_email, '@', 2);

  v_listing_domain := public.derive_domain_from_url(v_website_url);
  if v_listing_domain is null then
    raise exception 'This listing has no website on file -- ask the directory to claim it for you instead';
  end if;
  if public.is_generic_email_domain(v_claimant_domain) then
    raise exception 'Please use your organisation email address, not a personal email provider';
  end if;
  if v_claimant_domain is distinct from v_listing_domain then
    raise exception 'Your email domain (%) does not match this listing''s website domain (%)', v_claimant_domain, v_listing_domain;
  end if;

  insert into public.claims (
    directory_id, directory_item_id, status, claimant_email, claimant_domain, listing_domain,
    verification_method, created_by, started_at, verified_at
  ) values (
    v_directory_id, p_directory_item_id, 'verified', v_email, v_claimant_domain, v_listing_domain,
    'domain_email', 'self_service', now(), now()
  ) returning id into v_claim_id;

  insert into public.claim_users (claim_id, email, role, invited_at)
  values (v_claim_id, v_email, 'owner', now());

  update public.directory_entries set current_claim_id = v_claim_id, updated_at = now() where id = p_directory_item_id;

  return v_claim_id;
end;
$$;

comment on function public.start_self_service_claim(text, text) is
  'The public "Claim this listing" entry point -- callable by anon. Verifies the work email''s domain against the listing''s own website domain (or rejects generic providers / no website on file) and creates the claim already verified. Does not send the magic link or record any event -- the caller (published page JS) does both after this succeeds.';

revoke all on function public.start_self_service_claim(text, text) from public;
grant execute on function public.start_self_service_claim(text, text) to anon, authenticated;

create or replace function public.activate_self_service_claim(p_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_created_by text;
  v_directory_id text;
  v_directory_item_id text;
begin
  if not public.can_access_claim(p_claim_id) then
    return false;
  end if;

  select status, created_by, directory_id, directory_item_id
    into v_status, v_created_by, v_directory_id, v_directory_item_id
  from public.claims where id = p_claim_id;

  if v_status <> 'verified' or v_created_by <> 'self_service' then
    return false;
  end if;

  update public.claims set status = 'active', activated_at = now(), updated_at = now() where id = p_claim_id;

  insert into public.map_engagement_events (directory_id, listing_id, event_type, surface, meta)
  values (v_directory_id, v_directory_item_id, 'listing_claim_complete', 'directory_site', '{}'::jsonb);

  return true;
end;
$$;

comment on function public.activate_self_service_claim(uuid) is
  'Called once right after a self-service claimant''s first magic-link login (see link_claim_user_by_email()). No-ops (returns false) on anything other than the caller''s own verified, self-service claim -- safe to call speculatively for every claim get_my_claim_context() returns. Records listing_claim_complete server-side since the caller is authenticated by this point and the anon-only engagement-events RLS policy would otherwise reject a client-side insert.';

revoke all on function public.activate_self_service_claim(uuid) from public, anon;
grant execute on function public.activate_self_service_claim(uuid) to authenticated;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'start_self_service_claim') then
    raise exception 'VERIFY FAILED: start_self_service_claim() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'activate_self_service_claim') then
    raise exception 'VERIFY FAILED: activate_self_service_claim() was not created';
  end if;
  -- Fail-safe: a bogus claim id must return false, not error.
  if public.activate_self_service_claim(gen_random_uuid()) is distinct from false then
    raise exception 'VERIFY FAILED: activate_self_service_claim() did not fail safe (false) for an unknown claim';
  end if;
  raise notice 'VERIFY PASSED: self-service claim RPCs created';
end $$;
