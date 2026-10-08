-- ============================================================
-- Migration: 20260927120000_claim_ownership_transfer_rpcs
-- Description: Phase 8 of the Claimed Directory Listings epic — ownership
--              transfer. The owner picks a new owner, who is either:
--                - an existing, already-logged-in editor on this claim ->
--                  transfer completes immediately (no further verification
--                  needed, they already proved control of that email via
--                  their own earlier magic-link login), or
--                - anyone else (a brand-new email, or an editor who was
--                  invited but never actually logged in) -> the transfer
--                  goes `pending` and only completes once that person
--                  accepts their magic-link invitation, per the epic spec's
--                  own rule ("where a new user is invited, they must
--                  verify/accept... before ownership transfer completes").
--              The previous owner is always demoted to editor, never
--              removed, matching the epic's non-negotiable rule.
--
--              Two RPCs:
--              - transfer_claim_ownership(claim_id, new_owner_email, name?)
--                — callable by the claim's own owner OR a platform
--                admin/directory contact (can_manage_client()), the same
--                "admin uses the identical underlying model" rule every
--                other admin-vs-self-service claim action already follows.
--                Returns (status, claim_user_id) where status is
--                'completed' or 'pending' so the caller knows whether to
--                also send a magic-link invitation.
--              - complete_pending_ownership_transfer(claim_id) — called
--                once from ClaimLogin.jsx right after a NEW owner's first
--                magic-link login (alongside the existing
--                activate_self_service_claim() from Phase 7), mirroring
--                that same "safe to call speculatively for every claim,
--                no-ops (false) if not eligible" pattern.
--
--              New claim_users.owner_transfer_pending column marks exactly
--              one row per claim as "this is who a pending transfer is
--              waiting on" -- starting a new transfer always clears any
--              stale pending flag first, so re-inviting (or changing your
--              mind about) a not-yet-accepted transfer target can't leave
--              two rows pending at once.
-- Affected tables: claim_users (1 column added)
-- Rollback: _20260927120000_claim_ownership_transfer_rpcs.rollback.sql
-- Author: Claude Code
-- Date: 2026-09-27
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
  if not exists (select 1 from pg_proc where proname = 'is_claim_owner') then
    raise exception 'ABORT: is_claim_owner() does not exist — apply 20260923150000_claim_manager_shell_rpcs.sql first';
  end if;
  if not exists (select 1 from pg_proc where proname = 'can_manage_client') then
    raise exception 'ABORT: can_manage_client() does not exist — apply 20260923140000_claims_lifecycle_rpcs.sql first';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'claim_users' and column_name = 'owner_transfer_pending'
  ) then
    raise exception 'ABORT: claim_users.owner_transfer_pending already exists — migration may have already run';
  end if;
end $$;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

alter table public.claim_users add column owner_transfer_pending boolean not null default false;
comment on column public.claim_users.owner_transfer_pending is
  'True on at most one row per claim: the invited-but-not-yet-logged-in person a pending ownership transfer is waiting on. Cleared the moment they log in and complete_pending_ownership_transfer() runs, or if a new transfer supersedes this one first.';

create or replace function public.transfer_claim_ownership(
  p_claim_id uuid,
  p_new_owner_email text,
  p_new_owner_name text default null
)
returns table (status text, claim_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_email text;
  v_owner_row_id uuid;
  v_target_id uuid;
  v_target_user_id uuid;
begin
  select d.client_id into v_client_id
  from public.claims c join public.directories d on d.id = c.directory_id
  where c.id = p_claim_id;

  if v_client_id is null then
    raise exception 'Claim not found';
  end if;

  if not (public.is_claim_owner(p_claim_id) or public.can_manage_client(v_client_id)) then
    raise exception 'Access denied';
  end if;

  v_email := lower(trim(coalesce(p_new_owner_email, '')));
  if v_email = '' or v_email not like '%@%' then
    raise exception 'A valid email is required';
  end if;

  select id into v_owner_row_id from public.claim_users
  where claim_id = p_claim_id and role = 'owner' and removed_at is null;
  if v_owner_row_id is null then
    raise exception 'This claim has no current owner to transfer from';
  end if;

  select id, user_id into v_target_id, v_target_user_id
  from public.claim_users
  where claim_id = p_claim_id and email = v_email and removed_at is null;

  if v_target_id is not null and v_target_id = v_owner_row_id then
    raise exception 'That is already the owner';
  end if;

  -- Only one pending transfer at a time -- a new transfer supersedes any
  -- earlier not-yet-accepted one.
  update public.claim_users set owner_transfer_pending = false, updated_at = now()
  where claim_id = p_claim_id and owner_transfer_pending = true;

  if v_target_id is not null and v_target_user_id is not null then
    -- Existing, already-verified editor -- no further acceptance needed.
    update public.claim_users set role = 'editor', updated_at = now() where id = v_owner_row_id;
    update public.claim_users set role = 'owner', owner_transfer_pending = false, updated_at = now() where id = v_target_id;
    return query select 'completed'::text, v_target_id;
  elsif v_target_id is not null then
    -- Invited before but never actually logged in -- (re)mark pending.
    update public.claim_users
    set name = coalesce(nullif(trim(p_new_owner_name), ''), name),
        owner_transfer_pending = true, invited_at = now(), updated_at = now()
    where id = v_target_id;
    return query select 'pending'::text, v_target_id;
  else
    insert into public.claim_users (claim_id, email, name, role, invited_at, owner_transfer_pending)
    values (p_claim_id, v_email, nullif(trim(p_new_owner_name), ''), 'editor', now(), true)
    returning id into v_target_id;
    return query select 'pending'::text, v_target_id;
  end if;
end;
$$;

comment on function public.transfer_claim_ownership(uuid, text, text) is
  'Owner-initiated (or admin-initiated) ownership transfer. Completes immediately for an already-logged-in editor; otherwise creates/marks a pending claim_users row that only becomes owner once that person accepts their own magic-link login (complete_pending_ownership_transfer). The previous owner is always demoted to editor, never removed.';

revoke all on function public.transfer_claim_ownership(uuid, text, text) from public, anon;
grant execute on function public.transfer_claim_ownership(uuid, text, text) to authenticated;

create or replace function public.complete_pending_ownership_transfer(p_claim_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_my_row_id uuid;
  v_pending boolean;
  v_owner_row_id uuid;
begin
  select id, owner_transfer_pending into v_my_row_id, v_pending
  from public.claim_users
  where claim_id = p_claim_id and user_id = auth.uid() and removed_at is null;

  if v_my_row_id is null or coalesce(v_pending, false) is not true then
    return false;
  end if;

  select id into v_owner_row_id from public.claim_users
  where claim_id = p_claim_id and role = 'owner' and removed_at is null;

  if v_owner_row_id is not null and v_owner_row_id <> v_my_row_id then
    update public.claim_users set role = 'editor', updated_at = now() where id = v_owner_row_id;
  end if;

  update public.claim_users
  set role = 'owner', owner_transfer_pending = false, accepted_at = coalesce(accepted_at, now()), updated_at = now()
  where id = v_my_row_id;

  return true;
end;
$$;

comment on function public.complete_pending_ownership_transfer(uuid) is
  'Called once right after a pending ownership-transfer target''s first magic-link login (alongside activate_self_service_claim() from Phase 7). No-ops (returns false) on anything other than the caller''s own pending-transfer row, so it''s safe to call speculatively for every claim get_my_claim_context() returns.';

revoke all on function public.complete_pending_ownership_transfer(uuid) from public, anon;
grant execute on function public.complete_pending_ownership_transfer(uuid) to authenticated;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- ------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'claim_users' and column_name = 'owner_transfer_pending'
  ) then
    raise exception 'VERIFY FAILED: claim_users.owner_transfer_pending was not added';
  end if;
  if not exists (select 1 from pg_proc where proname = 'transfer_claim_ownership') then
    raise exception 'VERIFY FAILED: transfer_claim_ownership() was not created';
  end if;
  if not exists (select 1 from pg_proc where proname = 'complete_pending_ownership_transfer') then
    raise exception 'VERIFY FAILED: complete_pending_ownership_transfer() was not created';
  end if;
  -- Fail-safe: a bogus claim id must return false, not error.
  if public.complete_pending_ownership_transfer(gen_random_uuid()) is distinct from false then
    raise exception 'VERIFY FAILED: complete_pending_ownership_transfer() did not fail safe (false) for an unknown claim';
  end if;
  raise notice 'VERIFY PASSED: claim ownership transfer RPCs created';
end $$;
